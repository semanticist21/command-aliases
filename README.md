# Tauri + Swift + macOS App Store 통합 패턴 가이드

> **프로젝트**: AnyImage Converter
> **목적**: 다른 Tauri 프로젝트에서 재사용 가능한 Swift 통합 및 App Store 배포 패턴

---

## 목차

1. [Swift 통합 패턴](#1-swift-통합-패턴)
2. [In-App Purchase (IAP) 구현](#2-in-app-purchase-iap-구현)
3. [macOS App Store 코드 서명](#3-macos-app-store-코드-서명)
4. [디자인 시스템 패턴](#4-디자인-시스템-패턴)

---

## 1. Swift 통합 패턴

Tauri에서 Swift를 사용하는 방법은 **2가지**입니다:

### 1.1 Swift Sidecar (CLI 프로세스)

**사용 시기**: macOS 네이티브 API를 비동기적으로 호출하고, 프로세스 격리가 필요한 경우

**장점**:
- ✅ 독립 실행 파일로 앱과 격리
- ✅ JSON 통신으로 간단한 데이터 교환
- ✅ 크래시 시 앱 전체 영향 없음

**단점**:
- ❌ GUI 다이얼로그 표시 불가 (백그라운드 프로세스)
- ❌ 프로세스 실행 오버헤드

#### 1.1.1 Swift Sidecar 구현 (heic-sidecar 예시)

**Swift CLI 코드** (`src-tauri/sidecars/heic-sidecar.swift`):

```swift
#!/usr/bin/env swift

import Foundation
import ImageIO
import UniformTypeIdentifiers
import CoreGraphics

// JSON 응답 구조체
struct Response: Codable {
    let success: Bool
    let message: String?
    let data: String?   // base64 인코딩 데이터 (선택)
    let error: String?
}

// HEIC 디코딩 함수
func decodeHEIC(inputPath: String, outputFormat: String, outputPath: String?) -> Response {
    guard let imageSource = CGImageSourceCreateWithURL(
        URL(fileURLWithPath: inputPath) as CFURL, nil
    ) else {
        return Response(success: false, message: nil, data: nil,
                       error: "Failed to read HEIC file")
    }

    // 포맷 결정
    let utType: CFString = outputFormat.lowercased() == "png"
        ? UTType.png.identifier as CFString
        : UTType.jpeg.identifier as CFString

    // 메타데이터 보존
    let sourceProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [CFString: Any] ?? [:]
    var filteredProperties: [CFString: Any] = [:]

    let validKeys: [CFString] = [
        kCGImagePropertyTIFFDictionary,
        kCGImagePropertyExifDictionary,
        kCGImagePropertyGPSDictionary,
        // ... 기타 메타데이터 키
    ]

    for key in validKeys {
        if let value = sourceProperties[key] {
            filteredProperties[key] = value
        }
    }

    // 파일 쓰기
    guard let destination = CGImageDestinationCreateWithURL(
        URL(fileURLWithPath: outputPath!) as CFURL, utType, 1, nil
    ) else {
        return Response(success: false, message: nil, data: nil,
                       error: "Failed to create output file")
    }

    CGImageDestinationAddImageFromSource(destination, imageSource, 0,
                                        filteredProperties as CFDictionary)

    guard CGImageDestinationFinalize(destination) else {
        return Response(success: false, message: nil, data: nil,
                       error: "Failed to write output file")
    }

    return Response(success: true, message: "HEIC decoded successfully",
                   data: nil, error: nil)
}

// JSON 출력 함수
func printJSON(_ response: Response) {
    if let jsonData = try? JSONEncoder().encode(response),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)  // stdout로 JSON 출력
    }
}

// CLI 진입점
func main() {
    let args = CommandLine.arguments

    guard args.count >= 4 else {
        printJSON(Response(success: false, message: nil, data: nil,
                          error: "Usage: heic-sidecar decode <input> <format> <output>"))
        exit(1)
    }

    let action = args[1]
    let inputPath = args[2]
    let format = args[3]
    let outputPath = args[4]

    let response = decodeHEIC(inputPath: inputPath, outputFormat: format,
                             outputPath: outputPath)
    printJSON(response)
    exit(response.success ? 0 : 1)
}

main()
```

**Rust 통신 레이어** (`src-tauri/src/heic.rs`):

```rust
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct HeicResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<String>,
    pub error: Option<String>,
}

/// HEIC 파일을 PNG/JPEG로 디코딩
pub async fn decode_heic(
    app: tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    format: &str,
) -> Result<(), String> {
    // Sidecar 실행 (tauri-plugin-shell 사용)
    let output = app
        .shell()
        .sidecar("heic-sidecar")  // tauri.conf.json에 등록된 이름
        .map_err(|e| format!("Failed to create heic-sidecar: {}", e))?
        .args(["decode", input_path, format, output_path])
        .output()
        .await
        .map_err(|e| format!("Failed to execute heic-sidecar: {}", e))?;

    // JSON 응답 파싱
    let response: HeicResponse = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.error {
        return Err(error);
    }

    Ok(())
}
```

**Tauri 설정** (`src-tauri/tauri.conf.json`):

```json
{
  "bundle": {
    "externalBin": [
      "sidecars/heic-sidecar"
    ]
  }
}
```

**빌드 스크립트** (`scripts/build-sidecars.sh`):

```bash
#!/bin/bash
set -e

cd src-tauri/sidecars

echo "🔨 Building heic-sidecar..."
swiftc -target aarch64-apple-macosx12.0 \
  heic-sidecar.swift \
  -o heic-sidecar-aarch64-apple-darwin

echo "✅ heic-sidecar built successfully"
```

**React에서 호출**:

```typescript
import { invoke } from "@tauri-apps/api/core";

// Tauri command로 래핑된 함수 호출
await invoke("convert_heic_to_png", {
  inputPath: "/path/to/image.heic",
  outputPath: "/path/to/output.png"
});
```

---

### 1.2 Swift Static Library (FFI)

**사용 시기**: GUI 다이얼로그 표시, 앱 프로세스 내에서 동기 실행이 필요한 경우

**장점**:
- ✅ GUI 컨텍스트 유지 (시스템 다이얼로그 표시 가능)
- ✅ FFI 호출로 빠른 실행
- ✅ StoreKit IAP 같은 GUI 기반 API 사용 가능

**단점**:
- ❌ 앱 바이너리에 포함되어 크기 증가
- ❌ 크래시 시 앱 전체 영향

#### 1.2.1 Swift Static Library 구현 (IAP 예시)

**Swift Static Library 코드** (`src-tauri/swift/iap-lib.swift`):

```swift
import Foundation
import StoreKit

// C 호환 함수 (extern "C")
@_cdecl("iap_check_pro_status")
public func iap_check_pro_status() -> Bool {
    // UserDefaults에서 구매 상태 확인
    return UserDefaults.standard.bool(forKey: "isPro")
}

@_cdecl("iap_purchase_pro_mode")
public func iap_purchase_pro_mode() -> Bool {
    // StoreKit 구매 플로우 실행 (동기화)
    let semaphore = DispatchSemaphore(value: 0)
    var success = false

    Task {
        do {
            let product = try await Product.products(for: ["com.example.pro"]).first
            let result = try await product?.purchase()

            switch result {
            case .success(let verification):
                // 구매 성공
                UserDefaults.standard.set(true, forKey: "isPro")
                success = true
            default:
                success = false
            }
        } catch {
            success = false
        }
        semaphore.signal()
    }

    semaphore.wait()
    return success
}

@_cdecl("iap_get_product_info")
public func iap_get_product_info() -> UnsafeMutablePointer<CChar>? {
    let semaphore = DispatchSemaphore(value: 0)
    var jsonString = ""

    Task {
        do {
            let product = try await Product.products(for: ["com.example.pro"]).first

            let response = [
                "id": product?.id ?? "",
                "name": product?.displayName ?? "",
                "price": product?.displayPrice ?? ""
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: response)
            jsonString = String(data: jsonData, encoding: .utf8) ?? ""
        } catch {
            jsonString = "{\"error\": \"Failed to load product\"}"
        }
        semaphore.signal()
    }

    semaphore.wait()
    return strdup(jsonString)  // Rust에서 해제 필요
}

@_cdecl("iap_free_string")
public func iap_free_string(_ ptr: UnsafeMutablePointer<CChar>?) {
    free(ptr)
}
```

**Rust FFI 바인딩** (`src-tauri/src/iap.rs`):

```rust
use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::os::raw::c_char;

// C 함수 선언 (Swift static library에서 제공)
extern "C" {
    fn iap_check_pro_status() -> bool;
    fn iap_purchase_pro_mode() -> bool;
    fn iap_restore_purchases() -> bool;
    fn iap_get_product_info() -> *mut c_char;
    fn iap_free_string(ptr: *mut c_char);
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IAPResponse {
    pub id: Option<String>,
    pub name: Option<String>,
    pub price: Option<String>,
    pub error: Option<String>,
}

/// Pro 모드 구매 상태 확인
#[tauri::command]
pub async fn check_pro_status() -> Result<bool, String> {
    let is_pro = unsafe { iap_check_pro_status() };
    Ok(is_pro)
}

/// Pro 모드 구매
#[tauri::command]
pub async fn purchase_pro_mode() -> Result<bool, String> {
    let success = unsafe { iap_purchase_pro_mode() };
    Ok(success)
}

/// 제품 정보 조회
#[tauri::command]
pub async fn get_product_info() -> Result<IAPResponse, String> {
    unsafe {
        let c_str_ptr = iap_get_product_info();
        if c_str_ptr.is_null() {
            return Err("Failed to get product info".to_string());
        }

        let c_str = CStr::from_ptr(c_str_ptr);
        let json_str = c_str
            .to_str()
            .map_err(|e| format!("UTF-8 conversion error: {}", e))?;

        let response: IAPResponse = serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?;

        // Swift에서 할당한 메모리 해제
        iap_free_string(c_str_ptr);

        Ok(response)
    }
}
```

**Cargo 빌드 설정** (`src-tauri/Cargo.toml`):

```toml
[build-dependencies]
tauri-build = { version = "2", features = [] }

[target.'cfg(target_os = "macos")'.dependencies]
# No additional deps needed - static library linked via build.rs
```

**빌드 스크립트** (`src-tauri/build.rs`):

```rust
fn main() {
    #[cfg(target_os = "macos")]
    {
        // Swift static library 링크
        println!("cargo:rustc-link-search=native=target/aarch64-apple-darwin/release");
        println!("cargo:rustc-link-lib=static=iap");

        // Swift 런타임 프레임워크 링크
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=StoreKit");
    }

    tauri_build::build()
}
```

**Static Library 빌드 스크립트** (`scripts/build-iap-lib.sh`):

```bash
#!/bin/bash
set -e

SWIFT_DIR="src-tauri/swift"
OUTPUT_DIR="src-tauri/target"

# 타겟 아키텍처 결정
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-apple-darwin"
else
    TARGET="x86_64-apple-darwin"
fi

# Swift 컴파일 플래그
SWIFT_FLAGS="-sdk /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
SWIFT_FLAGS="$SWIFT_FLAGS -target $TARGET"
SWIFT_FLAGS="$SWIFT_FLAGS -O"  # 최적화

# 출력 디렉토리 생성
mkdir -p "$OUTPUT_DIR/$TARGET/release"

# Swift → Object 파일
echo "🔨 Compiling iap-lib.swift..."
swiftc $SWIFT_FLAGS \
    -c "$SWIFT_DIR/iap-lib.swift" \
    -o "$OUTPUT_DIR/iap-lib.o"

# Static Library 생성
echo "📦 Creating static library libiap.a..."
ar rcs "$OUTPUT_DIR/$TARGET/release/libiap.a" "$OUTPUT_DIR/iap-lib.o"

# Object 파일 정리
rm "$OUTPUT_DIR/iap-lib.o"

echo "✅ IAP static library built successfully!"
```

**React에서 호출**:

```typescript
import { invoke } from "@tauri-apps/api/core";

// Pro 모드 확인
const isPro = await invoke<boolean>("check_pro_status");

// 구매 실행 (StoreKit 다이얼로그 표시)
const success = await invoke<boolean>("purchase_pro_mode");

// 제품 정보 조회
const productInfo = await invoke<IAPResponse>("get_product_info");
```

---

### 1.3 Swift 통합 패턴 비교표

| 항목 | Sidecar (CLI) | Static Library (FFI) |
|------|---------------|----------------------|
| **통신 방식** | JSON (stdout) | C FFI 함수 호출 |
| **프로세스** | 독립 실행 파일 | 앱 바이너리 내장 |
| **GUI 지원** | ❌ 불가 (백그라운드) | ✅ 가능 (앱 컨텍스트) |
| **속도** | 느림 (프로세스 생성) | 빠름 (직접 호출) |
| **크래시 격리** | ✅ 앱 영향 없음 | ❌ 앱 전체 크래시 |
| **빌드 산출물** | 별도 바이너리 | .a 파일 (앱에 링크) |
| **코드 서명** | 개별 서명 필요 | 앱과 함께 서명 |
| **사용 예시** | HEIC 변환, 이미지 처리 | IAP, 시스템 권한 요청 |

---

## 2. In-App Purchase (IAP) 구현

### 2.1 StoreKit 2 통합 (Swift Static Library)

**제품 ID 설정** (App Store Connect):
- 제품 ID: `com.yourapp.pro`
- 유형: Non-Consumable (영구 구매)

**Swift 구현 패턴**:

```swift
import StoreKit

// 1. 제품 로드
let products = try await Product.products(for: ["com.yourapp.pro"])
let proProduct = products.first

// 2. 구매 실행
let result = try await proProduct.purchase()

switch result {
case .success(let verification):
    // 구매 검증
    switch verification {
    case .verified(let transaction):
        // ✅ 정상 구매
        await transaction.finish()
        UserDefaults.standard.set(true, forKey: "isPro")

    case .unverified(_, let error):
        // ❌ 검증 실패
        print("Verification failed: \(error)")
    }

case .userCancelled:
    // 사용자 취소
    return false

case .pending:
    // 구매 대기 중 (가족 공유 승인 등)
    return false

@unknown default:
    return false
}

// 3. 구매 복원
for await result in Transaction.currentEntitlements {
    if case .verified(let transaction) = result {
        if transaction.productID == "com.yourapp.pro" {
            UserDefaults.standard.set(true, forKey: "isPro")
            await transaction.finish()
        }
    }
}
```

### 2.2 Pro Mode 상태 관리 (React + Zustand)

**Zustand Store** (`src/stores/pro-mode-store.ts`):

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

interface ProModeStore {
  isPro: boolean;
  isLoading: boolean;
  checkProStatus: () => Promise<void>;
  purchaseProMode: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
}

export const useProModeStore = create<ProModeStore>()(
  persist(
    (set, get) => ({
      isPro: false,
      isLoading: false,

      checkProStatus: async () => {
        set({ isLoading: true });
        try {
          const isPro = await invoke<boolean>("check_pro_status");
          set({ isPro, isLoading: false });
        } catch (error) {
          console.error("Failed to check pro status:", error);
          set({ isLoading: false });
        }
      },

      purchaseProMode: async () => {
        set({ isLoading: true });
        try {
          const success = await invoke<boolean>("purchase_pro_mode");
          if (success) {
            set({ isPro: true, isLoading: false });
          } else {
            set({ isLoading: false });
          }
          return success;
        } catch (error) {
          console.error("Purchase failed:", error);
          set({ isLoading: false });
          return false;
        }
      },

      restorePurchases: async () => {
        set({ isLoading: true });
        try {
          const isPro = await invoke<boolean>("restore_purchases");
          set({ isPro, isLoading: false });
          return isPro;
        } catch (error) {
          console.error("Restore failed:", error);
          set({ isLoading: false });
          return false;
        }
      },
    }),
    {
      name: "pro-mode-storage",  // localStorage 키
      partialize: (state) => ({ isPro: state.isPro }),  // isPro만 저장
    }
  )
);
```

**컴포넌트에서 사용**:

```typescript
import { useProModeStore } from "@/stores/pro-mode-store";

function App() {
  const { isPro, isLoading, checkProStatus, purchaseProMode } = useProModeStore();

  useEffect(() => {
    // 앱 시작 시 Pro 상태 확인
    checkProStatus();
  }, []);

  const handlePurchase = async () => {
    const success = await purchaseProMode();
    if (success) {
      toast.success("Pro Mode 구매 완료!");
    } else {
      toast.error("구매가 취소되었습니다.");
    }
  };

  return (
    <div>
      {isPro ? (
        <Badge>Pro Mode</Badge>
      ) : (
        <Button onClick={handlePurchase} disabled={isLoading}>
          {isLoading ? "처리 중..." : "Pro Mode 구매"}
        </Button>
      )}
    </div>
  );
}
```

### 2.3 파일 제한 로직 (Pro Mode)

**Tauri Command에서 제한 적용**:

```rust
#[tauri::command]
pub async fn add_file_from_path(
    path: String,
    is_pro_mode: bool,
    state: State<'_, FileListState>,
) -> Result<(), String> {
    let mut file_list = state.0.lock().await;

    // Free 모드 파일 제한 (5개)
    if !is_pro_mode && file_list.len() >= 5 {
        return Err("Free mode is limited to 5 files. Upgrade to Pro Mode for unlimited files.".to_string());
    }

    // 파일 추가 로직
    file_list.push(/* ... */);
    Ok(())
}
```

**React에서 호출 시 Pro 상태 전달**:

```typescript
const { isPro } = useProModeStore();

await invoke("add_file_from_path", {
  path: "/path/to/file.jpg",
  isProMode: isPro,  // Pro 상태 전달
});
```

---

## 3. macOS App Store 코드 서명

### 3.1 인증서 준비

**필요한 인증서** (Apple Developer 계정 필요, $99/year):

1. **Developer ID Application** (개발 및 테스트)
2. **3rd Party Mac Developer Application** (App Store 제출용)
3. **3rd Party Mac Developer Installer** (PKG 서명용)

**인증서 다운로드**:
1. Apple Developer → Certificates → "+" 버튼
2. "3rd Party Mac Developer Application" 선택
3. CSR 파일 업로드 (키체인 접근 → 인증서 지원 → 인증 기관에서 인증서 요청)
4. 다운로드 후 더블클릭하여 키체인에 설치

### 3.2 Provisioning Profile 생성

**App Store Connect에서**:
1. App 등록 (Bundle ID: `com.yourcompany.yourapp`)
2. Certificates, Identifiers & Profiles → Profiles → "+"
3. "Mac App Store" 선택
4. App ID 선택 → 인증서 선택 → 프로필 다운로드
5. `apple_profile/` 디렉토리에 저장

### 3.3 Entitlements 설정

**메인 앱** (`src-tauri/Entitlements.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Sandbox 활성화 (App Store 필수) -->
    <key>com.apple.security.app-sandbox</key>
    <true/>

    <!-- 파일 시스템 접근 -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>

    <!-- 네트워크 접근 (URL에서 이미지 다운로드) -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- IAP 활성화 -->
    <key>com.apple.security.app-sandbox</key>
    <true/>
</dict>
</plist>
```

**Sidecar** (`src-tauri/SidecarEntitlements.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Sandbox 활성화 -->
    <key>com.apple.security.app-sandbox</key>
    <true/>

    <!-- 상속된 파일 접근 권한 -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

### 3.4 코드 서명 스크립트

**전체 서명 프로세스** (`scripts/create-pkg.sh`):

```bash
#!/bin/bash
set -e

APP_NAME="AnyImage - Batch Converter"
APP_PATH="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
PKG_PATH="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}.pkg"
ENTITLEMENTS="src-tauri/Entitlements.plist"
SIDECAR_ENTITLEMENTS="src-tauri/SidecarEntitlements.plist"

# 서명 ID (Keychain에 설치된 인증서)
SIGNING_IDENTITY="3rd Party Mac Developer Application: Your Name (TEAM_ID)"
INSTALLER_IDENTITY="3rd Party Mac Developer Installer: Your Name (TEAM_ID)"

echo "🔐 Code signing .app bundle..."

# 1. Sidecar 먼저 서명 (중요!)
echo "  → Signing heic-sidecar..."
if [ -f "${APP_PATH}/Contents/MacOS/heic-sidecar" ]; then
  codesign --force --sign "${SIGNING_IDENTITY}" \
    --entitlements "${SIDECAR_ENTITLEMENTS}" \
    --options runtime \
    "${APP_PATH}/Contents/MacOS/heic-sidecar"
fi

# 2. 메인 앱 서명 (--deep 사용 안 함!)
echo "  → Signing main app..."
codesign --force --sign "${SIGNING_IDENTITY}" \
  --entitlements "${ENTITLEMENTS}" \
  --options runtime \
  "${APP_PATH}"

# 3. 서명 검증
echo "✅ Verifying signature..."
codesign --verify --verbose "${APP_PATH}"
spctl --assess --verbose "${APP_PATH}"

# 4. PKG 생성 및 서명
echo "📦 Creating .pkg installer..."
productbuild \
  --component "${APP_PATH}" /Applications \
  --sign "${INSTALLER_IDENTITY}" \
  "${PKG_PATH}"

echo "✅ PKG created: ${PKG_PATH}"

# 5. PKG 서명 검증
echo "🔍 Verifying pkg signature..."
pkgutil --check-signature "${PKG_PATH}"
```

**서명 순서 (중요!)**:
1. ✅ **Sidecar 먼저 서명** (가장 안쪽부터)
2. ✅ **메인 앱 서명** (`--deep` 사용 안 함 - sidecar 서명 보존)
3. ✅ **PKG 서명**

**검증 명령어**:

```bash
# 앱 서명 확인
codesign -dv --verbose=4 "${APP_PATH}"

# Sidecar 서명 확인
codesign -d --entitlements :- "${APP_PATH}/Contents/MacOS/heic-sidecar" | grep app-sandbox

# PKG 서명 확인
pkgutil --check-signature "${PKG_PATH}"

# Gatekeeper 평가
spctl --assess --verbose "${APP_PATH}"
```

### 3.5 App Store 업로드

**Transporter 사용**:

1. **PKG 생성**: `bun run appstore` (자동 빌드 + 서명)
2. **Transporter 열기**: `/Applications/Transporter.app`
3. **PKG 드래그 앤 드롭**: `AnyImage - Batch Converter.pkg`
4. **Upload** 클릭
5. **App Store Connect**에서 빌드 확인 (10-30분 소요)

**주의사항**:
- ⚠️ Bundle ID가 App Store Connect와 **정확히 일치**해야 함
- ⚠️ Version/Build Number가 이전 빌드보다 높아야 함
- ⚠️ Provisioning Profile이 최신 상태여야 함

---

## 4. 디자인 시스템 패턴

### 4.1 Tailwind CSS v4 + oklch 컬러

**테마 설정** (`src/index.css`):

```css
@import "tailwindcss";

/* 다크 모드 커스텀 variant */
@custom-variant dark (&:is(.dark *));

/* 테마 변수 정의 */
@theme inline {
  --font-sans: "Lexend Deca", ui-sans-serif, system-ui, sans-serif;
  --radius: 0.625rem;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... */
}

/* oklch 컬러 (Light 모드) */
:root {
  --background: oklch(1 0 0);          /* 순백 */
  --foreground: oklch(0.145 0 0);      /* 진한 회색 */
  --primary: oklch(0.205 0 0);         /* 거의 검정 */
  --destructive: oklch(0.577 0.245 27.325);  /* 빨강 */
  /* ... */
}

/* Dark 모드 */
.dark {
  --background: oklch(20%, 0%, 89.876%);  /* 진한 회색 */
  --foreground: oklch(0.985 0 0);         /* 밝은 회색 */
  --primary: oklch(0.922 0 0);            /* 거의 흰색 */
  /* ... */
}
```

**oklch 컬러의 장점**:
- ✅ **지각적 균일성**: 밝기 값이 실제 보이는 밝기와 일치
- ✅ **더 넓은 색 공간**: RGB보다 생생한 색상 표현
- ✅ **보간 품질**: 그라데이션이 자연스러움

**테마 전환** (next-themes):

```typescript
import { ThemeProvider } from "next-themes";

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* 앱 컴포넌트 */}
    </ThemeProvider>
  );
}
```

### 4.2 Radix UI + React 19 패턴

**⚠️ 중요**: React 19는 자동 ref 전달 지원 → `forwardRef` 불필요

**Button 컴포넌트** (`src/components/ui/button.tsx`):

```typescript
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// CVA로 variant 정의
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

// React 19 패턴: forwardRef 없이 일반 함수
function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"  // 디버깅용
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

**사용 예시**:

```typescript
import { Button } from "@/components/ui/button";

// 기본 사용
<Button variant="default">클릭</Button>

// asChild로 다형성 (Link 등)
<Button asChild>
  <a href="/pro">Pro Mode 구매</a>
</Button>

// variant 조합
<Button variant="destructive" size="sm">삭제</Button>
```

### 4.3 shadcn/ui 컴포넌트 설치

**⚠️ 주의**: CLI는 React 18 패턴으로 생성 → **수동 변환 필요**

**설치**:

```bash
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest add dialog
bunx --bun shadcn@latest add dropdown-menu
```

**React 19 변환 체크리스트**:

```typescript
// ❌ BEFORE (React 18 패턴)
import { forwardRef } from "react";

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    return <button ref={ref} className={className} {...props} />;
  }
);
Button.displayName = "Button";

// ✅ AFTER (React 19 패턴)
function Button({ className, ...props }: ButtonProps) {
  return <button className={className} data-slot="button" {...props} />;
}
```

### 4.4 Biome 코드 스타일

**설정** (`biome.json`):

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "javascript": {
    "formatter": {
      "jsxQuoteStyle": "double",      // JSX는 큰따옴표
      "quoteStyle": "double",         // JS는 큰따옴표
      "semicolons": "always",         // 세미콜론 필수
      "trailingCommas": "all",        // 후행 쉼표 항상
      "bracketSpacing": false         // {foo} (공백 없음)
    }
  },
  "linter": {
    "rules": {
      "correctness": {
        "useExhaustiveDependencies": "off"  // React Compiler 사용
      }
    }
  }
}
```

**명령어**:

```bash
bun lint      # 린트 검사
bun format    # 포맷 적용
bun check     # 린트 + 포맷 + 자동 수정
```

---

## 5. 빌드 및 배포 워크플로우

### 5.1 버전 관리

**버전 동기화 스크립트** (`scripts/bump-version.sh`):

```bash
#!/bin/bash
set -e

# 사용법: ./bump-version.sh [patch|minor|major]
BUMP_TYPE=${1:-patch}

# package.json에서 현재 버전 읽기
CURRENT_VERSION=$(jq -r .version package.json)

# 새 버전 계산
NEW_VERSION=$(node -e "
  const semver = require('semver');
  console.log(semver.inc('$CURRENT_VERSION', '$BUMP_TYPE'));
")

echo "📌 Bumping version: $CURRENT_VERSION → $NEW_VERSION"

# 1. package.json 업데이트
jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp
mv package.json.tmp package.json

# 2. Cargo.toml 업데이트
sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

# 3. tauri.conf.json 업데이트
jq ".version = \"$NEW_VERSION\"" src-tauri/tauri.conf.json > tauri.conf.json.tmp
mv tauri.conf.json.tmp src-tauri/tauri.conf.json

echo "✅ Version bumped to $NEW_VERSION"

# Git commit
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"

echo "🏷️ Created tag: v$NEW_VERSION"
```

**사용법**:

```bash
bun run bump              # 0.1.27 → 0.1.28 (patch)
bun run bump:minor        # 0.1.27 → 0.2.0
bun run bump:major        # 0.1.27 → 1.0.0

# 버전 업 + App Store 빌드
bun run appstore:patch    # Bump patch + build
```

### 5.2 전체 빌드 파이프라인

**package.json scripts**:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsgo && vite build",
    "tauri": "tauri",
    "typecheck": "tsgo --noEmit",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "check": "biome check --write .",

    "bump": "bash scripts/bump-version.sh patch",
    "bump:patch": "bash scripts/bump-version.sh patch",
    "bump:minor": "bash scripts/bump-version.sh minor",
    "bump:major": "bash scripts/bump-version.sh major",

    "appstore": "bun tauri build --bundles app --target aarch64-apple-darwin && bash scripts/create-pkg.sh",
    "appstore:patch": "bash scripts/bump-version.sh patch && bun run appstore",
    "appstore:minor": "bash scripts/bump-version.sh minor && bun run appstore",
    "appstore:major": "bash scripts/bump-version.sh major && bun run appstore"
  }
}
```

**빌드 흐름**:

```
1. Swift Sidecar 빌드 (scripts/build-sidecars.sh)
   ↓
2. Swift Static Library 빌드 (scripts/build-iap-lib.sh)
   ↓
3. Rust 백엔드 빌드 (cargo build --release)
   ↓
4. React 프론트엔드 빌드 (tsgo && vite build)
   ↓
5. Tauri 앱 번들 생성 (.app)
   ↓
6. 코드 서명 (scripts/create-pkg.sh)
   ↓
7. PKG 생성 및 서명
   ↓
8. Transporter로 App Store 업로드
```

---

## 6. 트러블슈팅

### 6.1 Sidecar 관련 오류

**문제**: `Failed to create sidecar`

**원인**:
- Sidecar 바이너리가 빌드되지 않음
- `tauri.conf.json`에 등록 안 됨
- 파일 이름 불일치

**해결**:

```bash
# 1. Sidecar 빌드 확인
ls -la src-tauri/sidecars/

# 2. tauri.conf.json 확인
cat src-tauri/tauri.conf.json | grep externalBin

# 3. 수동 빌드
bash scripts/build-sidecars.sh
```

### 6.2 코드 서명 오류

**문제**: `code object is not signed at all`

**원인**:
- Sidecar 서명 누락
- 서명 순서 잘못됨 (메인 앱 먼저 서명 → sidecar 서명 덮어씀)

**해결**:

```bash
# 서명 순서: Sidecar → Main App → PKG
codesign --force --sign "${SIGNING_IDENTITY}" \
  --entitlements SidecarEntitlements.plist \
  --options runtime \
  "${APP_PATH}/Contents/MacOS/heic-sidecar"

# --deep 사용 금지! (sidecar 서명 손실)
codesign --force --sign "${SIGNING_IDENTITY}" \
  --entitlements Entitlements.plist \
  --options runtime \
  "${APP_PATH}"  # --deep 없이
```

### 6.3 App Sandbox 권한 오류

**문제**: `operation not permitted` (파일 접근)

**원인**:
- Entitlements에 권한 누락
- User-selected files만 접근 가능

**해결**:

```xml
<!-- Entitlements.plist -->
<key>com.apple.security.files.user-selected.read-write</key>
<true/>

<!-- 사용자가 선택한 파일만 접근 가능 -->
<!-- 임의 경로 접근 불가 (/Users/xxx/Documents 직접 접근 X) -->
```

### 6.4 IAP 테스트

**Sandbox 환경 테스트**:

1. **App Store Connect**: Sandbox Tester 계정 생성
2. **macOS 설정**: Apple ID 로그아웃 (시스템 환경설정)
3. **앱 실행**: 구매 시도 → Sandbox 계정으로 로그인
4. **구매 완료**: UserDefaults 확인

**주의**:
- ⚠️ Sandbox 계정은 실제 Apple ID와 **다른 이메일** 사용
- ⚠️ 실제 결제 없이 테스트 가능
- ⚠️ 프로덕션 빌드만 테스트 가능 (디버그 빌드 불가)

---

## 7. 체크리스트

### 새 프로젝트에서 이 패턴 적용 시

**Swift Sidecar 추가**:
- [ ] `src-tauri/sidecars/your-sidecar.swift` 생성
- [ ] `scripts/build-sidecars.sh`에 빌드 스크립트 추가
- [ ] `tauri.conf.json` → `bundle.externalBin` 등록
- [ ] `scripts/create-pkg.sh`에 서명 스크립트 추가
- [ ] `src-tauri/SidecarEntitlements.plist` 권한 설정
- [ ] Rust 통신 레이어 (`heic.rs` 참고)

**Swift Static Library 추가**:
- [ ] `src-tauri/swift/your-lib.swift` 생성 (`@_cdecl` 함수)
- [ ] `scripts/build-iap-lib.sh` 작성 (swiftc → ar)
- [ ] `src-tauri/build.rs`에 링크 설정
- [ ] `src-tauri/src/your-ffi.rs` FFI 바인딩
- [ ] Framework 링크 (`-framework Foundation`)

**IAP 통합**:
- [ ] App Store Connect에서 제품 ID 등록
- [ ] Swift StoreKit 2 코드 작성
- [ ] Rust FFI 바인딩 (`iap.rs`)
- [ ] Zustand Store 생성 (`pro-mode-store.ts`)
- [ ] Entitlements에 IAP 권한 추가

**App Store 배포**:
- [ ] 인증서 다운로드 (Application + Installer)
- [ ] Provisioning Profile 생성
- [ ] `Entitlements.plist` 작성
- [ ] `SidecarEntitlements.plist` 작성
- [ ] `scripts/create-pkg.sh` 작성
- [ ] `scripts/bump-version.sh` 작성
- [ ] Transporter로 업로드 테스트

**디자인 시스템**:
- [ ] Tailwind v4 + oklch 컬러 설정
- [ ] shadcn/ui 컴포넌트 설치 후 React 19 변환
- [ ] Biome 설정 (double quotes, no bracket spacing)
- [ ] next-themes 다크모드 설정

---

## 8. 참고 자료

**공식 문서**:
- [Tauri v2 문서](https://v2.tauri.app/)
- [StoreKit 2 가이드](https://developer.apple.com/storekit/)
- [App Store 제출 가이드](https://developer.apple.com/app-store/submissions/)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4-alpha)
- [Radix UI](https://www.radix-ui.com/)

**코드 서명**:
- [Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)

**컬러 시스템**:
- [oklch 소개](https://oklch.com/)
- [oklch vs RGB](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)

---

**작성자**: AnyImage Converter 프로젝트
**버전**: 1.0.0
**최종 수정**: 2025년
