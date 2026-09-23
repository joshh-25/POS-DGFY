#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent
SetWinDelay -1

; ChatGPT Pixel-Perfect Dual Window Layout
; Ctrl + Alt + F11 = apply borderless 50/50 layout
; Ctrl + Alt + R   = restore normal Windows border/corners
; Ctrl + Alt + Q   = quit script

SEAM_OVERLAP := 1

DWMWA_WINDOW_CORNER_PREFERENCE := 33
DWMWA_BORDER_COLOR := 34
DWMWCP_DEFAULT := 0
DWMWCP_DONOTROUND := 1
DWMWA_COLOR_DEFAULT := 0xFFFFFFFF
DWMWA_COLOR_NONE := 0xFFFFFFFE

SetDwmUInt(hwnd, attribute, value) {
    data := Buffer(4, 0)
    NumPut("UInt", value, data)
    try DllCall(
        "dwmapi\DwmSetWindowAttribute",
        "Ptr", hwnd,
        "UInt", attribute,
        "Ptr", data.Ptr,
        "UInt", 4
    )
}

MakeBorderless(hwnd) {
    global DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE
    global DWMWA_COLOR_NONE, DWMWCP_DONOTROUND

    SetDwmUInt(hwnd, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE)
    SetDwmUInt(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND)
}

RestoreAppearance(hwnd) {
    global DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE
    global DWMWA_COLOR_DEFAULT, DWMWCP_DEFAULT

    SetDwmUInt(hwnd, DWMWA_BORDER_COLOR, DWMWA_COLOR_DEFAULT)
    SetDwmUInt(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT)
}

GetMouseMonitor() {
    MouseGetPos(&mx, &my)
    count := MonitorGetCount()

    Loop count {
        MonitorGet(A_Index, &L, &T, &R, &B)
        if (mx >= L && mx < R && my >= T && my < B)
            return A_Index
    }
    return 1
}

GetFrameOffsets(hwnd) {
    id := "ahk_id " hwnd
    WinGetPos(&wx, &wy, &ww, &wh, id)

    rect := Buffer(16, 0)

    ; DWMWA_EXTENDED_FRAME_BOUNDS = 9
    result := DllCall(
        "dwmapi\DwmGetWindowAttribute",
        "Ptr", hwnd,
        "UInt", 9,
        "Ptr", rect.Ptr,
        "UInt", 16
    )

    if (result != 0) {
        return {Left: 0, Top: 0, Right: 0, Bottom: 0}
    }

    visualLeft   := NumGet(rect, 0, "Int")
    visualTop    := NumGet(rect, 4, "Int")
    visualRight  := NumGet(rect, 8, "Int")
    visualBottom := NumGet(rect, 12, "Int")

    return {
        Left: visualLeft - wx,
        Top: visualTop - wy,
        Right: (wx + ww) - visualRight,
        Bottom: (wy + wh) - visualBottom
    }
}

MoveVisual(hwnd, x, y, width, height) {
    id := "ahk_id " hwnd
    offsets := GetFrameOffsets(hwnd)

    actualX := x - offsets.Left
    actualY := y - offsets.Top
    actualW := width + offsets.Left + offsets.Right
    actualH := height + offsets.Top + offsets.Bottom

    WinMove(actualX, actualY, actualW, actualH, id)
}

ApplyPixelPerfectLayout(*) {
    global SEAM_OVERLAP

    windows := WinGetList("ahk_exe ChatGPT.exe")

    if (windows.Length < 2) {
        MsgBox("Open two ChatGPT windows first.`n`nThen press Ctrl + Alt + F11.")
        return
    }

    hwndLeft  := windows[1]
    hwndRight := windows[2]

    try WinRestore("ahk_id " hwndLeft)
    try WinRestore("ahk_id " hwndRight)

    Sleep 100

    MakeBorderless(hwndLeft)
    MakeBorderless(hwndRight)

    monitor := GetMouseMonitor()
    MonitorGetWorkArea(monitor, &screenLeft, &screenTop, &screenRight, &screenBottom)

    totalWidth  := screenRight - screenLeft
    totalHeight := screenBottom - screenTop
    leftWidth := Floor(totalWidth / 2)
    middle := screenLeft + leftWidth

    MoveVisual(
        hwndLeft,
        screenLeft,
        screenTop,
        leftWidth + SEAM_OVERLAP,
        totalHeight
    )

    MoveVisual(
        hwndRight,
        middle,
        screenTop,
        screenRight - middle,
        totalHeight
    )

    Sleep 100

    MoveVisual(
        hwndLeft,
        screenLeft,
        screenTop,
        leftWidth + SEAM_OVERLAP,
        totalHeight
    )

    MoveVisual(
        hwndRight,
        middle,
        screenTop,
        screenRight - middle,
        totalHeight
    )

    MakeBorderless(hwndLeft)
    MakeBorderless(hwndRight)
}

RestoreAll(*) {
    windows := WinGetList("ahk_exe ChatGPT.exe")
    for hwnd in windows
        RestoreAppearance(hwnd)
}

KeepBorderless(*) {
    windows := WinGetList("ahk_exe ChatGPT.exe")
    for hwnd in windows
        MakeBorderless(hwnd)
}

^!F11::ApplyPixelPerfectLayout()
^!r::RestoreAll()
^!q::ExitApp()

SetTimer(KeepBorderless, 1500)
