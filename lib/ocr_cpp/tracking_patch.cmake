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
	std::vector<unsigned char> trackedFingerprint;
	const int fingerprintColumns = 32;
	const int fingerprintRows = 8;
	const int fingerprintDifferenceLimit = 10;

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

	// The border alone cannot tell two adjacent items apart because Tarkov can
	// replace one name rectangle with another without ever showing a frame with
	// no rectangle. Keep a tiny binary brightness fingerprint of the rectangle's
	// interior. 32 x 8 samples are only 256 GetPixel calls per validation and do
	// not involve screenshots, OCR or item lookup.
	auto captureTooltipFingerprint = [&](const POINT& bottomLeft,
		const POINT& bottomRight,
		const POINT& topLeft) -> std::vector<unsigned char> {
		std::vector<unsigned char> fingerprint;
		fingerprint.reserve(fingerprintColumns * fingerprintRows);

		LONG left = topLeft.x + 3;
		LONG right = bottomRight.x - 3;
		LONG top = topLeft.y + 3;
		LONG bottom = bottomLeft.y - 3;
		if (!cachedDesktopDC || right <= left || bottom <= top) {
			return fingerprint;
		}

		for (int row = 0; row < fingerprintRows; row++) {
			LONG y = top +
				((row * 2 + 1) * (bottom - top)) /
				(2 * fingerprintRows);

			for (int column = 0; column < fingerprintColumns; column++) {
				LONG x = left +
					((column * 2 + 1) * (right - left)) /
					(2 * fingerprintColumns);
				COLORREF color = GetPixel(cachedDesktopDC, x, y);
				if (color == CLR_INVALID) {
					fingerprint.push_back(0);
					continue;
				}

				int luminance =
					(static_cast<int>(GetRValue(color)) * 3 +
					 static_cast<int>(GetGValue(color)) * 6 +
					 static_cast<int>(GetBValue(color))) / 10;
				fingerprint.push_back(luminance >= 100 ? 1 : 0);
			}
		}

		return fingerprint;
	};

	auto fingerprintMatches = [&](const std::vector<unsigned char>& current) -> bool {
		if (trackedFingerprint.empty() ||
			current.size() != trackedFingerprint.size()) {
			return true;
		}

		int differences = 0;
		for (size_t i = 0; i < current.size(); i++) {
			if (current[i] != trackedFingerprint[i]) {
				differences++;
				if (differences > fingerprintDifferenceLimit) {
					return false;
				}
			}
		}
		return true;
	};

	// 0 = no matching border, 1 = same tooltip, 2 = a tooltip is present but
	// its interior changed enough to be a different item's name rectangle.
	auto trackedCandidateState = [&](const POINT& bottomLeft,
		const POINT& bottomRight,
		const POINT& topLeft) -> int {
		if (!trackedRectStillVisible(bottomLeft, bottomRight, topLeft)) {
			return 0;
		}

		std::vector<unsigned char> currentFingerprint =
			captureTooltipFingerprint(bottomLeft, bottomRight, topLeft);
		return fingerprintMatches(currentFingerprint) ? 1 : 2;
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
# tooltip is tracked the loop runs at about 60 Hz. If the border disappears we
# emit TOOLTIP_LOST; if Tarkov swaps the contents in-place for another item we
# emit TOOLTIP_CHANGED. Electron hides the stale price immediately for either.
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
					int trackedState = trackedCandidateState(
						trackedBottomLeft,
						trackedBottomRight,
						trackedTopLeft
					);

					if (trackedState == 1) {
						trackedMissCount = 0;
					}
					else {
						trackingTooltip = false;
						trackedMissCount = 0;
						foundTooltip = false;
						showedMouseMoved = false;
						trackedFingerprint.clear();
						cachedPixelBuffer.pixels.clear();
						lastScannedCursor = { 0, 0 };
						cout << (trackedState == 2 ? "TOOLTIP_CHANGED" : "TOOLTIP_LOST") << endl;
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
					bool sawChangedTooltip = false;

					POINT candidateBottomLeft = trackedBottomLeft;
					POINT candidateBottomRight = trackedBottomRight;
					POINT candidateTopLeft = trackedTopLeft;
					int candidateState = trackedCandidateState(
						candidateBottomLeft,
						candidateBottomRight,
						candidateTopLeft
					);
					bool trackedVisible = candidateState == 1;
					sawChangedTooltip = candidateState == 2;

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
						candidateState = trackedCandidateState(
							candidateBottomLeft,
							candidateBottomRight,
							candidateTopLeft
						);
						trackedVisible = candidateState == 1;
						sawChangedTooltip = sawChangedTooltip || candidateState == 2;
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
							candidateState = trackedCandidateState(
								candidateBottomLeft,
								candidateBottomRight,
								candidateTopLeft
							);
							trackedVisible = candidateState == 1;
							sawChangedTooltip = sawChangedTooltip || candidateState == 2;
						}
					}

					if (trackedVisible) {
						trackedBottomLeft = candidateBottomLeft;
						trackedBottomRight = candidateBottomRight;
						trackedTopLeft = candidateTopLeft;
						trackedMissCount = 0;
						foundTooltip = true;
					}
					else {
						trackingTooltip = false;
						trackedMissCount = 0;
						foundTooltip = false;
						showedMouseMoved = false;
						trackedFingerprint.clear();
						cachedPixelBuffer.pixels.clear();
						lastScannedCursor = { 0, 0 };
						cout << (sawChangedTooltip ? "TOOLTIP_CHANGED" : "TOOLTIP_LOST") << endl;
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
							trackedFingerprint = captureTooltipFingerprint(
								trackedBottomLeft,
								trackedBottomRight,
								trackedTopLeft
							);
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
