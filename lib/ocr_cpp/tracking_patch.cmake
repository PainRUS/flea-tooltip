# Lightweight tooltip tracking is applied after the language and right-edge
# transforms. It deliberately does not inspect tooltip contents: successful
# OCR remains authoritative, while tracking only follows the already-known
# rectangle geometry.

set(ORIGINAL_TRACKING_STATE [=[
	int sleepInterval = 25;

	while (true) {
]=])
set(PATCHED_TRACKING_STATE [=[
	int sleepInterval = 25;

	bool trackingTooltip = false;
	bool trackingMovedSinceScan = false;
	POINT trackedBottomLeft{};
	POINT trackedBottomRight{};
	POINT trackedTopLeft{};
	const LONG trackedWidthTolerance = 5;
	const LONG trackedHeightTolerance = 4;

	auto freshBorderPixelNear = [&](LONG x, LONG y) -> bool {
		if (!cachedDesktopDC) return false;

		// A two-pixel neighborhood keeps the cheap check tolerant of minor
		// anti-aliasing/sub-pixel differences between rendered frames.
		for (LONG dy = -2; dy <= 2; dy++) {
			for (LONG dx = -2; dx <= 2; dx++) {
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

	auto trackedRectSameGeometry = [&](const POINT& bottomLeft,
		const POINT& bottomRight,
		const POINT& topLeft) -> bool {
		LONG bottomCenterX = bottomLeft.x +
			(bottomRight.x - bottomLeft.x) / 2;

		// The known border itself must still exist.
		if (!freshBorderPixelNear(bottomLeft.x, bottomLeft.y) ||
			!freshBorderPixelNear(bottomCenterX, bottomLeft.y) ||
			!freshBorderPixelNear(bottomRight.x, bottomRight.y) ||
			!freshBorderPixelNear(topLeft.x, topLeft.y)) {
			return false;
		}

		// Detect a materially larger rectangle too. Merely checking the old
		// right/top points is insufficient because those points would still lie
		// on a longer border. Probe just beyond the configured size tolerance.
		bool extendsRight = freshBorderPixelNear(
			bottomRight.x + trackedWidthTolerance + 1,
			bottomRight.y
		);
		bool extendsUp = freshBorderPixelNear(
			topLeft.x,
			topLeft.y - trackedHeightTolerance - 1
		);

		return !extendsRight && !extendsUp;
	};

	auto releaseTrackedTooltip = [&](bool hidePriceImmediately) {
		trackingTooltip = false;
		trackingMovedSinceScan = false;
		foundTooltip = false;
		showedMouseMoved = false;
		cachedPixelBuffer.pixels.clear();
		lastScannedCursor = { 0, 0 };

		if (hidePriceImmediately) {
			cout << "TOOLTIP_LOST" << endl;
			fflush(stdout);
		}
	};

	while (true) {
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_TRACKING_STATE}" TRACKING_STATE_POS)
if(TRACKING_STATE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR tracking state insertion point was not found")
endif()
string(REPLACE "${ORIGINAL_TRACKING_STATE}" "${PATCHED_TRACKING_STATE}"
  OCR_SOURCE_CONTENT "${OCR_SOURCE_CONTENT}")

# While the cursor is stationary, keep validating geometry. If the cursor moved
# since the last successful OCR but the rectangle retained the same dimensions,
# allow exactly one normal OCR pass after a short stop. This covers the rare
# case of two adjacent items whose name rectangles happen to have the same size,
# without running OCR for every mouse pixel.
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
					if (!trackedRectSameGeometry(
						trackedBottomLeft,
						trackedBottomRight,
						trackedTopLeft
					)) {
						// The old rectangle disappeared or materially changed size.
						// Hide the stale price now and make the existing scanner run
						// immediately on the current cursor position below.
						releaseTrackedTooltip(true);
						mouseStationaryCount = 3;
					}
					else if (trackingMovedSinceScan && mouseStationaryCount > 3) {
						// Same geometry after movement: perform one ordinary OCR pass
						// to catch a different item with an equal-sized tooltip. Keep
						// the current price visible until that normal OCR result arrives.
						releaseTrackedTooltip(false);
						mouseStationaryCount = 3;
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
					bool trackedVisible = trackedRectSameGeometry(
						candidateBottomLeft,
						candidateBottomRight,
						candidateTopLeft
					);

					// Normally the Tarkov tooltip translates with the cursor.
					if (!trackedVisible) {
						candidateBottomLeft = {
							trackedBottomLeft.x + cursorDeltaX,
							trackedBottomLeft.y + cursorDeltaY
						};
						candidateBottomRight = {
							trackedBottomRight.x + cursorDeltaX,
							trackedBottomRight.y + cursorDeltaY
						};
						candidateTopLeft = {
							trackedTopLeft.x + cursorDeltaX,
							trackedTopLeft.y + cursorDeltaY
						};
						trackedVisible = trackedRectSameGeometry(
							candidateBottomLeft,
							candidateBottomRight,
							candidateTopLeft
						);
					}

					// At a monitor edge Tarkov can clamp its tooltip while the cursor
					// continues moving. Check that clamped geometry as the last cheap
					// candidate before falling back to the original scanner.
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
								translatedTopLeft.y + cursorDeltaY + clampShiftY
							};
							trackedVisible = trackedRectSameGeometry(
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
						trackingMovedSinceScan = true;
						foundTooltip = true;
					}
					else {
						// Different geometry (or disappearance): hide the stale price,
						// then immediately hand control back to the original proven
						// border -> OCR -> item path in this same loop iteration.
						releaseTrackedTooltip(true);
						mouseStationaryCount = 3;
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
							trackingMovedSinceScan = false;
							trackedBottomLeft = bottomLeftBorderPoint;
							trackedBottomRight = bottomRightBorderPoint;
							trackedTopLeft = topLeftBorderPoint;
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
