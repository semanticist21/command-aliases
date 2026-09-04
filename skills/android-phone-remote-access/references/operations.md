# Android transport and control

Use this for phone transport and screen control only. Keep app-specific
recovery steps in the project that owns the app.

## Safety boundaries

- Act only on a phone the user explicitly authorized, and verify the target
  serial or hostname before taps, launches, installs, or log collection.
- Use TCP ADB only over a trusted tailnet or trusted LAN; never use a 5555
  listener on untrusted Wi-Fi.
- Tailscale provides network reachability; it does not provide ADB itself.
  Tailscale ACLs must permit the connection.
- Never expose or port-forward ADB TCP 5555 to the public internet. After
  temporary use, return adbd to USB mode while USB is connected, where
  supported:

      adb -s <serial> usb

## USB bootstrap to Tailscale ADB

This is the legacy TCP ADB path. Wireless debugging is not required.

1. Enable Developer options and USB debugging on the phone.
2. Connect USB and approve the computer's RSA prompt.
3. Verify that adb devices shows device.
4. Switch adbd to TCP 5555 while USB is still connected:
   adb -s <usb-serial> tcpip 5555
5. In Tailscale, find the phone's MagicDNS name, then connect:
   adb connect <phone-magicdns>:5555
6. Verify the remote serial with adb devices.

## Android wireless debugging alternative

Android 11+ can pair over the same Wi-Fi network, using the ports shown by
the phone:

    adb pair <phone-lan-address>:<pairing-port>
    adb connect <phone-lan-address>:<adb-port>

This is a separate pairing flow and does not by itself make the phone
reachable over Tailscale. Do not guess the ports; read them from the phone.

## Remote screen control

USB:

    scrcpy --serial <usb-serial> --no-audio -m 1024 -b 2M

Tailscale ADB:

    scrcpy --serial <phone-magicdns>:5555 --no-audio --keep-active -m 1024 -b 2M

Use an explicit serial whenever USB and remote entries are both listed.
--keep-active keeps the screen awake over TCP. --stay-awake only keeps
the device awake while it is physically plugged in.

Examples of host-side ADB operations:

    adb -s <phone-magicdns>:5555 exec-out screencap -p > phone.png
    adb -s <phone-magicdns>:5555 logcat -d -t 200
    adb -s <phone-magicdns>:5555 install <apk-path>
    adb -s <phone-magicdns>:5555 shell am start <activity>

## Legacy TCP ADB recovery caveat

For the legacy tcpip 5555 path, the phone can run its apps without USB. USB
is only needed to bootstrap or restore TCP ADB if a reboot or Android policy
resets adbd's TCP listener. Tailscale must remain connected.
Battery-optimization exclusions are device-specific; Xiaomi/POCO devices may
also require the system's “USB debugging (Security settings)” permission for
input injection.

Do not put passwords, tokens, private keys, serial numbers, device names,
MagicDNS names, private IPs, screenshots, logs, or project-specific
package/recovery instructions in this shared skill.
