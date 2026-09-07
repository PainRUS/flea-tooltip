# Lightweight tooltip tracking is applied to the generated scanner source after
# the language and right-edge geometry patches in CMakeLists.txt. Keeping it as
# a separate guarded transform makes the behavior easy to remove or adjust
# without touching the upstream-oriented ocr_cpp.cpp file.

# Add tracking state and cheap fresh-screen border checks. These checks use
# GetPixel directly on purpose: the normal 600x300 cache is a snapshot from the
# last OCR scan and must not be used to decide whether a moving tooltip still
# exists.
set(ORIGINAL_TRACKING_STATE [=[
	int sleepInterval = 25;

	while (true) {
]=])
set(PATCHED_TRACKING_STATE [=[
	int sleepInterval = 25;

	bool trackingTooltip = false;
	POINT trackedMousePos{};
	POINT trackedBottomLeft{};
	POINT trackedBottomRight{};
	POINT trackedTopLeft{};
	int trackedMissCount = 0;
	const int trackedMissLimit = 3;

	// Check a 3x3 neighborhood against the configured Tarkov tooltip border
	// color. A tiny tolerance makes tracking insensitive to one-pixel rounding
	// while remaining far cheaper than a new capture/OCR pass.
	auto freshBorderPixelNear = [&](LONG x, LONG y) -> bool {
		if (!cachedDesktopDC) return false;

		for (LONG dy = -1; dy <= 1; dy++) {
			for (LONG dx = -1; dx <= 1; dx++) {
				COLORREF color = GetPixel(cachedDesktopDC, x + dx, y + dy);
				if (color == CLR_INVALID) continue;

				short pixelRed = static_cast<short>(GetRValue(color));
				short pixelGreen = static_cast<short>(GetGValue(color));
				short pixelBlue = static_cast<short>(GetBValue(color));
				if (pixelIsBorderColor(pixelRed, pixelGreen, pixelBlue)) {
					return true;
				}
			}
		}

		return false;
	};

	// The exact tooltip rectangle is already known after OCR. Tracking only
	// samples a few points on that border; no screenshot, Tesseract call or item
	// search is performed here.
	auto trackedRectStillVisible = [&](const POINT& bottomLeft,
		const POINT& bottomRight,
		const POINT& topLeft) -> bool {
		LONG bottomCenterX = bottomLeft.x +
			(bottomRight.x - bottomLeft.x) / 2;

		bool bottomLeftOk = freshBorderPixelNear(bottomLeft.x, bottomLeft.y);
		bool bottomCenterOk = freshBorderPixelNear(bottomCenterX, bottomLeft.y);
		bool farEdgeOk =
			freshBorderPixelNear(bottomRight.x, bottomRight.y) ||
			freshBorderPixelNear(topLeft.x, topLeft.y);

		return bottomLeftOk && bottomCenterOk && farEdgeOk;
	};

	while (true) {
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_TRACKING_STATE}" OCR_TRACKING_STATE_POS)
if(OCR_TRACKING_STATE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR tracking state insertion point was not found")
endif()
string(REPLACE
  "${ORIGINAL_TRACKING_STATE}"
  "${PATCHED_TRACKING_STATE}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

# While a successfully scanned Tarkov name tooltip is being tracked, mouse
# movement must not reset foundTooltip or lastScannedCursor. Instead emit the
# new cursor coordinates so Electron can move its price card and cheaply test
# three candidate positions for the same game tooltip:
#   1) unchanged (Tarkov can pin it against a screen edge),
#   2) translated by the cursor delta,
#   3) translated then clamped inside the current monitor.
# Three consecutive misses are required before declaring the tooltip gone, so
# a single game-frame delay cannot cause a needless OCR rescan.
set(ORIGINAL_MOUSE_MOVED_BLOCK [=[
			else {
				if (!showedMouseMoved) {
					cout << "MOUSEMOVE" << endl;
					fflush(stdout);
					showedMouseMoved = true;
				}
				mouseStationaryCount = 0;
				foundTooltip = false;
				sleepInterval = 50;
				cachedPixelBuffer.pixels.clear();
				lastScannedCursor = { 0, 0 };
			}
]=])
set(PATCHED_MOUSE_MOVED_BLOCK [=[
			else {
				LONG cursorDeltaX = mousePos.x - lastValidMousePos.x;
				LONG cursorDeltaY = mousePos.y - lastValidMousePos.y;
				mouseStationaryCount = 0;

				if (trackingTooltip) {
					sleepInterval = 25;

					cout << "TRACKMOVE|" << mousePos.x << "|" << mousePos.y << endl;
					fflush(stdout);

					POINT candidateBottomLeft = trackedBottomLeft;
					POINT candidateBottomRight = trackedBottomRight;
					POINT candidateTopLeft = trackedTopLeft;
					bool trackedVisible = trackedRectStillVisible(
						candidateBottomLeft,
						candidateBottomRight,
						candidateTopLeft
					);

					// Normally the game tooltip follows the cursor by the same delta.
					if (!trackedVisible) {
						candidateBottomLeft.x += cursorDeltaX;
						candidateBottomLeft.y += cursorDeltaY;
						candidateBottomRight.x += cursorDeltaX;
						candidateBottomRight.y += cursorDeltaY;
						candidateTopLeft.x += cursorDeltaX;
						candidateTopLeft.y += cursorDeltaY;

						trackedVisible = trackedRectStillVisible(
							candidateBottomLeft,
							candidateBottomRight,
							candidateTopLeft
						);
					}

					// At a monitor edge Tarkov can clamp the name tooltip while the
					// cursor keeps moving. Test the translated rectangle after applying
					// the same geometric clamp, without making assumptions about item size.
					if (!trackedVisible) {
						LONG tooltipWidth = trackedBottomRight.x - trackedBottomLeft.x;
						LONG tooltipHeight = trackedBottomLeft.y - trackedTopLeft.y;

						POINT translatedBottomLeft = {
							trackedBottomLeft.x + cursorDeltaX,
							trackedBottomLeft.y + cursorDeltaY
						};
						POINT translatedTopLeft = {
							trackedTopLeft.x + cursorDeltaX,
							trackedTopLeft.y + cursorDeltaY
						};

						HMONITOR cursorMonitor =
							MonitorFromPoint(mousePos, MONITOR_DEFAULTTONEAREST);
						MONITORINFO monitorInfo = {};
						monitorInfo.cbSize = sizeof(MONITORINFO);
						if (cursorMonitor && GetMonitorInfo(cursorMonitor, &monitorInfo)) {
							LONG maxLeft = monitorInfo.rcMonitor.right - tooltipWidth;
							LONG maxTop = monitorInfo.rcMonitor.bottom - tooltipHeight;
							LONG clampedLeft = (std::max)(
								monitorInfo.rcMonitor.left,
								(std::min)(translatedBottomLeft.x, maxLeft)
							);
							LONG clampedTop = (std::max)(
								monitorInfo.rcMonitor.top,
								(std::min)(translatedTopLeft.y, maxTop)
							);
							LONG clampShiftX = clampedLeft - translatedBottomLeft.x;
							LONG clampShiftY = clampedTop - translatedTopLeft.y;

							candidateBottomLeft = {
								translatedBottomLeft.x + clampShiftX,
								translatedBottomLeft.y + clampShiftY
							};
							candidateBottomRight = {
								trackedBottomRight.x + cursorDeltaX + clampShiftX,
								trackedBottomRight.y + cursorDeltaY + clampShiftY
							};
							candidateTopLeft = {
								translatedTopLeft.x + clampShiftX,
								translatedTopLeft.y + clampShiftY
							};

							trackedVisible = trackedRectStillVisible(
								candidateBottomLeft,
								candidateBottomRight,
								candidateTopLeft
							);
						}
					}

					if (trackedVisible) {
						trackedBottomLeft = candidateBottomLeft;
						trackedBottomRight = candidateBottomRight;
						trackedTopLeft = candidateTopLeft;
						trackedMousePos = mousePos;
						trackedMissCount = 0;
						foundTooltip = true;
					}
					else {
						trackedMissCount++;
						if (trackedMissCount >= trackedMissLimit) {
							trackingTooltip = false;
							trackedMissCount = 0;
							foundTooltip = false;
							showedMouseMoved = false;
							cachedPixelBuffer.pixels.clear();
							lastScannedCursor = { 0, 0 };

							cout << "TOOLTIP_LOST" << endl;
							fflush(stdout);
						}
					}
				}
				else {
					if (!showedMouseMoved) {
						cout << "MOUSEMOVE" << endl;
						fflush(stdout);
						showedMouseMoved = true;
					}
					foundTooltip = false;
					sleepInterval = 50;
					cachedPixelBuffer.pixels.clear();
					lastScannedCursor = { 0, 0 };
				}
			}
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_MOUSE_MOVED_BLOCK}" OCR_MOUSE_MOVED_BLOCK_POS)
if(OCR_MOUSE_MOVED_BLOCK_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR mouse-movement block was not found")
endif()
string(REPLACE
  "${ORIGINAL_MOUSE_MOVED_BLOCK}"
  "${PATCHED_MOUSE_MOVED_BLOCK}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

# Once OCR has produced a usable name, remember the exact game-tooltip border
# that produced it. Subsequent cursor movement can now stay in the cheap
# tracking path until this border disappears.
set(ORIGINAL_OCR_SUCCESS [=[
							if (scanText.length() > 3) {
								lastScannedCursor = mousePos;
								cout << scanText << "||" << mousePos.x << "," << mousePos.y << endl;
]=])
set(PATCHED_OCR_SUCCESS [=[
							if (scanText.length() > 3) {
								trackingTooltip = true;
								trackedMousePos = mousePos;
								trackedBottomLeft = bottomLeftBorderPoint;
								trackedBottomRight = bottomRightBorderPoint;
								trackedTopLeft = topLeftBorderPoint;
								trackedMissCount = 0;
								lastScannedCursor = mousePos;
								cout << scanText << "||" << mousePos.x << "," << mousePos.y << endl;
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_OCR_SUCCESS}" OCR_SUCCESS_TRACKING_POS)
if(OCR_SUCCESS_TRACKING_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR success block was not found for tooltip tracking")
endif()
string(REPLACE
  "${ORIGINAL_OCR_SUCCESS}"
  "${PATCHED_OCR_SUCCESS}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)
