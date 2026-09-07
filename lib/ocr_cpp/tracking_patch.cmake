# Lightweight tooltip tracking is applied after the language and right-edge
# transforms. All checks use fresh desktop pixels, never the stale OCR cache.

set(ORIGINAL_TRACKING_STATE [=[
	int sleepInterval = 25;

	while (true) {
]=])
set(PATCHED_TRACKING_STATE [=[
	int sleepInterval = 25;

	bool trackingTooltip = false;
	POINT trackedBottomLeft{};
	POINT trackedBottomRight{};
	POINT trackedTopLeft{};
	int trackedMissCount = 0;
	const int trackedMissLimit = 1;

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
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_TRACKING_STATE}" TRACKING_STATE_POS)
if(TRACKING_STATE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR tracking state insertion point was not found")
endif()
string(REPLACE "${ORIGINAL_TRACKING_STATE}" "${PATCHED_TRACKING_STATE}"
  OCR_SOURCE_CONTENT "${OCR_SOURCE_CONTENT}")

# Keep validating the cached border even after the cursor stops. While a
# tooltip is tracked the loop runs at about 60 Hz; the first failed validation
# means Tarkov's name rectangle is gone and the cached price must disappear.
set(ORIGINAL_STATIONARY_BLOCK [=[
			if (
				lastValidMousePos.x == mousePos.x &&
				lastValidMousePos.y == mousePos.y
			) {
				mouseStationaryCount++;
				sleepInterval = 25;
			}
]=])
set(PATCHED_STATIONARY_BLOCK [=[
			if (
				lastValidMousePos.x == mousePos.x &&
				lastValidMousePos.y == mousePos.y
			) {
				mouseStationaryCount++;
				sleepInterval = trackingTooltip ? 16 : 25;

				if (trackingTooltip) {
					if (trackedRectStillVisible(
						trackedBottomLeft,
						trackedBottomRight,
						trackedTopLeft
					)) {
						trackedMissCount = 0;
					}
					else if (++trackedMissCount >= trackedMissLimit) {
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
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_STATIONARY_BLOCK}" TRACKING_STATIONARY_POS)
if(TRACKING_STATIONARY_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR stationary block was not found")
endif()
string(REPLACE "${ORIGINAL_STATIONARY_BLOCK}" "${PATCHED_STATIONARY_BLOCK}"
  OCR_SOURCE_CONTENT "${OCR_SOURCE_CONTENT}")

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
					sleepInterval = 16;

					POINT candidateBottomLeft = trackedBottomLeft;
					POINT candidateBottomRight = trackedBottomRight;
					POINT candidateTopLeft = trackedTopLeft;
					bool trackedVisible = trackedRectStillVisible(
						candidateBottomLeft,
						candidateBottomRight,
						candidateTopLeft
					);

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
						trackedMissCount = 0;
						foundTooltip = true;
					}
					else if (++trackedMissCount >= trackedMissLimit) {
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
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_MOUSE_MOVED_BLOCK}" TRACKING_MOVE_POS)
if(TRACKING_MOVE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR mouse-movement block was not found")
endif()
string(REPLACE "${ORIGINAL_MOUSE_MOVED_BLOCK}" "${PATCHED_MOUSE_MOVED_BLOCK}"
  OCR_SOURCE_CONTENT "${OCR_SOURCE_CONTENT}")

set(ORIGINAL_OCR_SUCCESS [=[
						if (scanText.length() > 3) {
							lastScannedCursor = mousePos;
							cout << scanText << "||" <<
								mousePos.x << "," << mousePos.y << endl;
]=])
set(PATCHED_OCR_SUCCESS [=[
						if (scanText.length() > 3) {
							trackingTooltip = true;
							trackedBottomLeft = bottomLeftBorderPoint;
							trackedBottomRight = bottomRightBorderPoint;
							trackedTopLeft = topLeftBorderPoint;
							trackedMissCount = 0;
							lastScannedCursor = mousePos;
							cout << scanText << "||" <<
								mousePos.x << "," << mousePos.y << endl;
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_OCR_SUCCESS}" TRACKING_SUCCESS_POS)
if(TRACKING_SUCCESS_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR success block was not found for tooltip tracking")
endif()
string(REPLACE "${ORIGINAL_OCR_SUCCESS}" "${PATCHED_OCR_SUCCESS}"
  OCR_SOURCE_CONTENT "${OCR_SOURCE_CONTENT}")
