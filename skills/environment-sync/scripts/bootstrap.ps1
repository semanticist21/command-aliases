[CmdletBinding()]
param(
    [ValidateSet('bootstrap', 'enroll', 'rotate', 'revoke')]
    [string]$Action = 'bootstrap'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Fail([string]$Message) {
    throw "secrets-sync: $Message"
}

function Find-Tailscale {
    $command = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    Fail 'Tailscale is required and must be signed in'
}

function Find-SshKeygen {
    $command = Get-Command ssh-keygen.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:WINDIR 'System32\OpenSSH\ssh-keygen.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    Fail 'OpenSSH Client is required; install the Windows OpenSSH Client capability and retry'
}

function Find-Tar {
    $command = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:WINDIR 'System32\tar.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    Fail 'the Windows tar utility is required'
}

if ([string]::IsNullOrWhiteSpace($HOME) -or -not [IO.Path]::IsPathRooted($HOME)) {
    Fail 'HOME must be an absolute path'
}

function Assert-SafeDirectory([string]$Path, [string]$Name) {
    if (Test-Path -LiteralPath $Path) {
        $item = Get-Item -LiteralPath $Path -Force
        if (-not $item.PSIsContainer -or $item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
            Fail "$Name must be a real directory"
        }
    }
}

function Assert-SafeFile([string]$Path, [string]$Name, [bool]$Required = $false) {
    if (-not (Test-Path -LiteralPath $Path)) {
        if ($Required) { Fail "$Name is missing" }
        return
    }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or $item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
        Fail "$Name must be a regular file"
    }
}

$tailscale = Find-Tailscale
$sshKeygen = if ($Action -eq 'revoke') { $null } else { Find-SshKeygen }
$tar = Find-Tar
$agentsDir = Join-Path $HOME '.agents'
$docDir = Join-Path $agentsDir 'doc'
$installDir = Join-Path $agentsDir 'bootstrap'
$pointer = Join-Path $docDir 'AGENTS.local.md'
$sshDir = Join-Path $HOME '.ssh'
$keyPath = Join-Path $sshDir 'secrets-sync_ed25519'
$pointerText = "# Machine-local agent context`n`n- Private bootstrap source: ``~/.agents/bootstrap```n"
$client = $null
$handler = $null

Assert-SafeDirectory $agentsDir '.agents'
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
$tempRoot = Join-Path $agentsDir ('.secrets-sync.' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User

try {
    & icacls.exe $tempRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" /T /C 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'could not create a private working directory' }
    $statusText = (& $tailscale status --json 2>$null | Out-String)
    if ($LASTEXITCODE -ne 0) { Fail 'cannot read authenticated Tailscale state' }
    $status = $statusText | ConvertFrom-Json
    if ($status.Self -isnot [PSCustomObject] -or
        ($null -ne $status.PSObject.Properties['Peer'] -and $status.Peer -isnot [PSCustomObject])) {
        Fail 'Tailnet discovery state is invalid'
    }
    $peers = @(if ($null -ne $status.PSObject.Properties['Peer']) {
        $status.Peer.PSObject.Properties | ForEach-Object { $_.Value }
    })
    $candidates = @($peers) + @($status.Self)
    foreach ($candidate in $candidates) {
        if ($candidate -isnot [PSCustomObject] -or
            ($null -ne $candidate.PSObject.Properties['Online'] -and $candidate.Online -isnot [bool])) {
            Fail 'Tailnet discovery state is invalid'
        }
        $tagsProperty = $candidate.PSObject.Properties['Tags']
        if ($null -ne $tagsProperty -and $null -ne $tagsProperty.Value -and
            ($tagsProperty.Value -isnot [array] -or @($tagsProperty.Value | Where-Object { $_ -isnot [string] }).Count -ne 0)) {
            Fail 'Tailnet discovery state is invalid'
        }
    }
    $anchors = @($candidates | Where-Object {
        $null -ne $_.PSObject.Properties['Online'] -and $_.Online -eq $true -and
        $null -ne $_.PSObject.Properties['Tags'] -and @($_.Tags) -contains 'tag:secrets-sync-anchor'
    })
    if ($anchors.Count -eq 0) { Fail 'no online bootstrap anchor is visible; verify the Tailnet, access policy, and anchor availability' }
    if ($anchors.Count -gt 1) { Fail 'multiple online bootstrap anchors are visible; keep exactly one active anchor' }
    $deviceId = [string]$status.Self.ID
    if ($status.Self.ID -isnot [string] -or $deviceId -notmatch '^[A-Za-z0-9._:-]{8,128}$') {
        Fail 'Tailscale did not report a stable local device ID'
    }
    $anchorHost = [string]$anchors[0].DNSName
    if ([string]::IsNullOrWhiteSpace($anchorHost)) {
        $anchorHost = [string]@($anchors[0].TailscaleIPs)[0]
    }
    $anchorHost = $anchorHost.TrimEnd('.')
    if ($anchorHost -notmatch '^[A-Za-z0-9._:-]{1,253}$') {
        Fail 'Tailnet anchor address is invalid'
    }
    $authority = if ($anchorHost.Contains(':')) { "[$anchorHost]" } else { $anchorHost }
    $baseUri = "https://$authority"

    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(20)
    $client.DefaultRequestHeaders.Add('X-Secrets-Sync-Device-ID', $deviceId)

    function Assert-HttpSuccess($Response, [string]$Context) {
        $code = [int]$Response.StatusCode
        if ($code -eq 403) { Fail 'Tailnet login, device identity, or source binding is not authorized for bootstrap' }
        if ($code -eq 503) { Fail 'the bootstrap anchor backend is unavailable' }
        if ($code -ne 200) { Fail "$Context failed (HTTP $code)" }
    }

    function Get-Bytes([string]$Path) {
        $response = $client.GetAsync($baseUri + $Path).GetAwaiter().GetResult()
        Assert-HttpSuccess $response 'the bootstrap anchor request'
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        return ,$bytes
    }

    function Post-PublicKey([string]$PublicKey) {
        $payload = @{ public_key = $PublicKey } | ConvertTo-Json -Compress
        $content = [Net.Http.StringContent]::new($payload, [Text.Encoding]::UTF8, 'application/json')
        $response = $client.PostAsync($baseUri + '/v1/enroll', $content).GetAwaiter().GetResult()
        Assert-HttpSuccess $response 'key enrollment'
        Assert-ActionResponse $response 'enrolled'
    }

    function Assert-ActionResponse($Response, [string]$Expected) {
        $text = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        try {
            $value = $text | ConvertFrom-Json
        } catch {
            Fail "key $Expected response contract is invalid"
        }
        $properties = @($value.PSObject.Properties.Name | Sort-Object)
        if ($properties.Count -ne 2 -or $properties[0] -ne 'changed' -or
            $properties[1] -ne $Expected -or $value.$Expected -ne $true -or
            $value.changed -isnot [bool]) {
            Fail "key $Expected response contract is invalid"
        }
    }

    function Get-PublicKey([string]$PrivateKey) {
        $value = (& $sshKeygen -y -f $PrivateKey 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $value -notmatch '^(ssh-ed25519) ([A-Za-z0-9+/]+={0,2})$') {
            Fail 'local device key is not a valid Ed25519 key'
        }
        return $value
    }

    function Assert-OwnerOnlyFile([string]$Path, [string]$Name) {
        Assert-SafeFile $Path $Name $true
        $actual = Get-Acl -LiteralPath $Path
        $rules = @($actual.Access)
        if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $identitySid.Value -or
            $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
            Fail "$Name ACL is not owner-only"
        }
    }

    function Protect-OwnerOnlyFile([string]$Path, [string]$Name) {
        Assert-SafeFile $Path $Name $true
        $acl = [Security.AccessControl.FileSecurity]::new()
        $acl.SetOwner($identitySid)
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $identitySid,
            [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
        [void]$acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $Path -AclObject $acl
        Assert-OwnerOnlyFile $Path $Name
    }

    function Protect-PrivateKey([string]$PrivateKey) {
        Protect-OwnerOnlyFile $PrivateKey 'device private key'
    }

    function Write-BootstrapPointer {
        Assert-SafeDirectory $docDir '.agents/doc'
        New-Item -ItemType Directory -Force -Path $docDir | Out-Null
        $temporaryPointer = Join-Path $docDir ('.AGENTS.local.md.' + [Guid]::NewGuid().ToString('N'))
        [IO.File]::WriteAllText($temporaryPointer, $pointerText, [Text.UTF8Encoding]::new($false))
        Protect-OwnerOnlyFile $temporaryPointer 'staged local pointer'
        try {
            [IO.File]::Move($temporaryPointer, $pointer)
        } catch {
            if (Test-Path -LiteralPath $temporaryPointer) {
                Remove-Item -LiteralPath $temporaryPointer -Force
            }
            Fail 'AGENTS.local.md appeared during installation; nothing was overwritten'
        }
    }

    function Enroll-Key {
        Assert-SafeDirectory $sshDir '.ssh'
        New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
        Assert-SafeFile $keyPath 'device private key'
        Assert-SafeFile ($keyPath + '.pub') 'device public key'
        if (-not (Test-Path -LiteralPath $keyPath)) {
            if (Test-Path -LiteralPath ($keyPath + '.pub')) {
                Fail 'an orphaned public device key already exists'
            }
            & $sshKeygen -q -t ed25519 -N '' -C '' -f $keyPath | Out-Null
            if ($LASTEXITCODE -ne 0) { Fail 'cannot generate a local device key' }
        }
        Protect-PrivateKey $keyPath
        Post-PublicKey (Get-PublicKey $keyPath)
    }

    function Rotate-Key {
        Assert-SafeDirectory $sshDir '.ssh'
        New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
        Assert-SafeFile $keyPath 'device private key'
        Assert-SafeFile ($keyPath + '.pub') 'device public key'
        $next = Join-Path $sshDir '.secrets-sync_ed25519.pending'
        Assert-SafeFile $next 'pending device private key'
        Assert-SafeFile ($next + '.pub') 'pending device public key'
        if (-not (Test-Path -LiteralPath $next)) {
            if (Test-Path -LiteralPath ($next + '.pub')) {
                Fail 'an orphaned pending public key already exists'
            }
            & $sshKeygen -q -t ed25519 -N '' -C '' -f $next | Out-Null
            if ($LASTEXITCODE -ne 0) { Fail 'cannot generate a replacement device key' }
        }
        Protect-PrivateKey $next
        Post-PublicKey (Get-PublicKey $next)
        Move-Item -Force -LiteralPath $next -Destination $keyPath
        if (Test-Path -LiteralPath ($next + '.pub')) {
            Move-Item -Force -LiteralPath ($next + '.pub') -Destination ($keyPath + '.pub')
        }
        Protect-PrivateKey $keyPath
    }

    $discoveryBytes = Get-Bytes '/.well-known/secrets-sync'
    $discovery = [Text.Encoding]::UTF8.GetString($discoveryBytes) | ConvertFrom-Json
    $properties = @($discovery.PSObject.Properties.Name)
    if ($properties.Count -ne 3 -or [int]$discovery.version -ne 1 -or
        [string]$discovery.snapshot -ne '/v1/bootstrap.tar.gz' -or
        [string]$discovery.enroll -ne '/v1/enroll') {
        Fail 'anchor discovery contract is invalid'
    }

    switch ($Action) {
        'enroll' {
            Enroll-Key
            Write-Output 'secrets-sync: device key enrolled'
            return
        }
        'rotate' {
            Rotate-Key
            Write-Output 'secrets-sync: device key rotated'
            return
        }
        'revoke' {
            $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Delete, $baseUri + '/v1/enroll')
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
            Assert-HttpSuccess $response 'key revocation'
            Assert-ActionResponse $response 'revoked'
            Write-Output 'secrets-sync: device key revoked'
            return
        }
    }

    if (Test-Path -LiteralPath $installDir) {
        Assert-SafeDirectory $installDir 'bootstrap destination'
        $installMarker = Join-Path $installDir '.secrets-sync-install'
        $pending = Join-Path $installDir '.secrets-sync-enrollment-pending'
        Assert-SafeFile $installMarker 'bootstrap install marker' $true
        Assert-SafeFile $pending 'bootstrap enrollment marker' $true
        if ([IO.File]::ReadAllText($installMarker) -ne "version=1`n" -or
            [IO.File]::ReadAllText($pending) -ne "pending=1`n") {
            Fail 'existing bootstrap destination is not a resumable install'
        }
        if (Test-Path -LiteralPath $pointer) {
            Assert-OwnerOnlyFile $pointer 'local pointer'
            if ([IO.File]::ReadAllText($pointer) -ne $pointerText) {
                Fail 'existing AGENTS.local.md is not the bootstrap pointer; nothing was overwritten'
            }
        } else {
            Write-BootstrapPointer
        }
        Enroll-Key
        Remove-Item -LiteralPath $pending -Force
        Write-Output 'secrets-sync: bootstrap enrollment resumed'
        return
    }
    if (Test-Path -LiteralPath $pointer) {
        Fail 'AGENTS.local.md already exists; nothing was overwritten'
    }

    $snapshotBytes = Get-Bytes '/v1/bootstrap.tar.gz'
    if ($snapshotBytes.Length -eq 0 -or $snapshotBytes.Length -gt 16777216) {
        Fail 'bootstrap snapshot size is invalid'
    }
    $snapshot = Join-Path $tempRoot 'bootstrap.tar.gz'
    [IO.File]::WriteAllBytes($snapshot, $snapshotBytes)
    $names = @(& $tar -tzf $snapshot 2>$null)
    if ($LASTEXITCODE -ne 0 -or $names.Count -eq 0) {
        Fail 'bootstrap snapshot is not a non-empty gzip tar archive'
    }
    foreach ($name in $names) {
        $normalized = ([string]$name).Replace('\', '/')
        if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized.StartsWith('/') -or
            $normalized.Contains(':') -or @($normalized.Split('/')) -contains '..') {
            Fail 'bootstrap snapshot contains an unsafe path'
        }
    }
    $verbose = @(& $tar -tvzf $snapshot 2>$null)
    if ($LASTEXITCODE -ne 0 -or $verbose.Count -eq 0) {
        Fail 'bootstrap snapshot metadata is invalid'
    }
    foreach ($entry in $verbose) {
        if ([string]::IsNullOrEmpty($entry) -or @('-', 'd') -notcontains $entry.Substring(0, 1)) {
            Fail 'bootstrap snapshot contains a link or special file'
        }
    }

    $stage = Join-Path $tempRoot 'content'
    New-Item -ItemType Directory -Path $stage | Out-Null
    & $tar -xzf $snapshot -C $stage --no-same-owner --no-same-permissions 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'cannot extract bootstrap snapshot' }
    $reparse = Get-ChildItem -LiteralPath $stage -Force -Recurse | Where-Object {
        $_.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)
    } | Select-Object -First 1
    if ($reparse) { Fail 'bootstrap snapshot extracted a link' }
    [IO.File]::WriteAllText((Join-Path $stage '.secrets-sync-install'), "version=1`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $stage '.secrets-sync-enrollment-pending'), "pending=1`n", [Text.UTF8Encoding]::new($false))
    & icacls.exe $stage /inheritance:r /grant:r "${identity}:(OI)(CI)F" /T /C 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'could not restrict restored files to the current Windows identity' }

    Move-Item -LiteralPath $stage -Destination $installDir
    Write-BootstrapPointer
    Enroll-Key
    Remove-Item -LiteralPath (Join-Path $installDir '.secrets-sync-enrollment-pending') -Force
    Write-Output 'secrets-sync: bootstrap restored and device key enrolled'
} finally {
    if ($client) { $client.Dispose() }
    if ($handler) { $handler.Dispose() }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
