cmake_minimum_required(VERSION 3.20)
project(FleaTooltipOCR LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Tesseract CONFIG REQUIRED)

# Keep the checked-in scanner source close to upstream while generating the
# small experimental changes used by this branch at build time. Every
# replacement is guarded so an upstream scanner change fails configuration
# instead of silently producing a partially patched executable.
set(OCR_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/ocr_cpp.cpp")
file(READ "${OCR_SOURCE}" OCR_SOURCE_CONTENT)

# Russian mode is explicit in the UI, but Tarkov's localized names mix
# Cyrillic with Latin model/caliber fragments. Load both Tesseract models when
# the UI selects Russian; English mode remains eng-only.
string(FIND "${OCR_SOURCE_CONTENT}" "ocrLanguage = requestedLanguage;" OCR_LANGUAGE_ASSIGNMENT_POS)
if(OCR_LANGUAGE_ASSIGNMENT_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR language assignment was not found in ocr_cpp.cpp")
endif()
string(REPLACE
  "ocrLanguage = requestedLanguage;"
  "ocrLanguage = requestedLanguage == \"rus\" ? \"rus+eng\" : requestedLanguage;"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

string(FIND "${OCR_SOURCE_CONTENT}" "debugRussian = ocrLanguage == \"rus\";" OCR_DEBUG_LANGUAGE_POS)
if(OCR_DEBUG_LANGUAGE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR debug language assignment was not found in ocr_cpp.cpp")
endif()
string(REPLACE
  "debugRussian = ocrLanguage == \"rus\";"
  "debugRussian = ocrLanguage.find(\"rus\") != std::string::npos;"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

# The search capture remains 600x300, but when the cursor is near a monitor
# edge move the whole rectangle inside that monitor instead of allowing part of
# the capture to fall outside the visible desktop. This keeps the left-shifted
# Tarkov tooltip completely available to the border scanner.
set(ORIGINAL_CAPTURE_BLOCK [=[
				// Keep the original 600x300 search capture unchanged. The point of
				// debug mode is to see its real coverage before deciding how to fix it.
				int captureX = bottomLeftBorderPoint.x - 100;
				int captureY = bottomLeftBorderPoint.y - 200;
				int captureWidth = 600;
				int captureHeight = 300;

				if (captureX < 0) captureX = 0;
				if (captureY < 0) captureY = 0;
]=])
set(PATCHED_CAPTURE_BLOCK [=[
				// Keep the original 600x300 search size, but shift the complete
				// rectangle inside the monitor that contains the cursor. Near the
				// right edge Tarkov moves long tooltips to the left, so discarding the
				// off-screen part of this search capture would hide the real left edge.
				int captureWidth = 600;
				int captureHeight = 300;
				int desiredCaptureX = bottomLeftBorderPoint.x - 100;
				int desiredCaptureY = bottomLeftBorderPoint.y - 200;

				RECT monitorRect = {};
				HMONITOR cursorMonitor = MonitorFromPoint(mousePos, MONITOR_DEFAULTTONEAREST);
				MONITORINFO monitorInfo = {};
				monitorInfo.cbSize = sizeof(MONITORINFO);
				if (cursorMonitor && GetMonitorInfo(cursorMonitor, &monitorInfo)) {
					monitorRect = monitorInfo.rcMonitor;
				}
				else {
					monitorRect.left = GetSystemMetrics(SM_XVIRTUALSCREEN);
					monitorRect.top = GetSystemMetrics(SM_YVIRTUALSCREEN);
					monitorRect.right = monitorRect.left + GetSystemMetrics(SM_CXVIRTUALSCREEN);
					monitorRect.bottom = monitorRect.top + GetSystemMetrics(SM_CYVIRTUALSCREEN);
				}

				const int monitorWidth = monitorRect.right - monitorRect.left;
				const int monitorHeight = monitorRect.bottom - monitorRect.top;
				captureWidth = std::min(captureWidth, monitorWidth);
				captureHeight = std::min(captureHeight, monitorHeight);

				int captureX = std::clamp(
					desiredCaptureX,
					static_cast<int>(monitorRect.left),
					static_cast<int>(monitorRect.right) - captureWidth
				);
				int captureY = std::clamp(
					desiredCaptureY,
					static_cast<int>(monitorRect.top),
					static_cast<int>(monitorRect.bottom) - captureHeight
				);
				bool captureShifted =
					captureX != desiredCaptureX || captureY != desiredCaptureY;
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_CAPTURE_BLOCK}" OCR_CAPTURE_BLOCK_POS)
if(OCR_CAPTURE_BLOCK_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR capture block was not found in ocr_cpp.cpp")
endif()
string(REPLACE
  "${ORIGINAL_CAPTURE_BLOCK}"
  "${PATCHED_CAPTURE_BLOCK}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

# Make the clamp visible in OCR Debug Mode. The cyan rectangle now always shows
# the actual in-monitor capture used by pixel checks.
set(ORIGINAL_CAPTURE_DEBUG [=[
					showDebugStep(
						debugShapes,
						debugText(
							L"1. Captured search area (600 x 300)",
							L"1. Снята область поиска (600 x 300)"
						)
					);
]=])
set(PATCHED_CAPTURE_DEBUG [=[
					if (captureShifted) {
						ostringstream shiftedLog;
						shiftedLog << "CAPTURE_CLAMPED|desired=" <<
							desiredCaptureX << "," << desiredCaptureY <<
							"|actual=" << captureX << "," << captureY <<
							"|monitor=" << monitorRect.left << "," << monitorRect.top <<
							"," << monitorRect.right << "," << monitorRect.bottom;
						debugLog(shiftedLog.str());
					}

					showDebugStep(
						debugShapes,
						captureShifted
							? debugText(
								L"1. Search area shifted inside current monitor",
								L"1. Область поиска сдвинута внутрь текущего монитора"
							)
							: debugText(
								L"1. Captured search area (600 x 300)",
								L"1. Снята область поиска (600 x 300)"
							)
					);
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_CAPTURE_DEBUG}" OCR_CAPTURE_DEBUG_POS)
if(OCR_CAPTURE_DEBUG_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR capture debug block was not found in ocr_cpp.cpp")
endif()
string(REPLACE
  "${ORIGINAL_CAPTURE_DEBUG}"
  "${PATCHED_CAPTURE_DEBUG}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

# Once any of the existing start/fallback pixels lands on the lower border,
# normalize that point to the real bottom-left corner. Use the same coarse-to-
# fine strategy as the existing right/top searches, but mirror it to the left:
# 50 -> 15 -> 5 -> 1 px. The captured region's left edge is the natural bound;
# there is no arbitrary maximum-distance constant.
set(ORIGINAL_FOUND_TOOLTIP [=[
					foundTooltip = true;

					if (debugMode) {
]=])
set(PATCHED_FOUND_TOOLTIP [=[
					foundTooltip = true;

					LONG leftSearchStartX = bottomLeftBorderPoint.x;
					short leftCheckpoints[4] = { 50, 15, 5, 1 };
					short leftOffset = 0;

					for (short i = 0; i < std::size(leftCheckpoints); i++) {
						short leftStep = leftCheckpoints[i];

						while (true) {
							short candidateOffset =
								static_cast<short>(leftOffset - leftStep);
							LONG candidateX =
								leftSearchStartX + candidateOffset;

							if (candidateX < captureX) {
								break;
							}

							if (!pixelIsValid(
								static_cast<short>(leftSearchStartX),
								static_cast<short>(bottomLeftBorderPoint.y),
								red,
								green,
								blue,
								candidateOffset
							)) {
								break;
							}

							leftOffset = candidateOffset;
						}

						if (debugMode) {
							LONG currentLeftX = leftSearchStartX + leftOffset;
							debugShapes.push_back({
								DebugShapeType::Line,
								leftSearchStartX,
								bottomLeftBorderPoint.y,
								currentLeftX,
								bottomLeftBorderPoint.y,
								RGB(80, 255, 120)
							});

							ostringstream leftLog;
							leftLog << "LEFT_SEARCH|step=" << leftStep <<
								"|x=" << currentLeftX;
							debugLog(leftLog.str());

							wstringstream leftLabel;
							leftLabel << debugText(
								L"5. Searching real bottom-left, checkpoint ",
								L"5. Поиск настоящего нижнего левого угла, шаг "
							) << leftStep << L" px";
							showDebugStep(debugShapes, leftLabel.str());
						}
					}

					bottomLeftBorderPoint.x = leftSearchStartX + leftOffset;

					if (debugMode) {
]=])
string(FIND "${OCR_SOURCE_CONTENT}" "${ORIGINAL_FOUND_TOOLTIP}" OCR_FOUND_TOOLTIP_POS)
if(OCR_FOUND_TOOLTIP_POS EQUAL -1)
  message(FATAL_ERROR "Expected found-tooltip block was not found in ocr_cpp.cpp")
endif()
string(REPLACE
  "${ORIGINAL_FOUND_TOOLTIP}"
  "${PATCHED_FOUND_TOOLTIP}"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

string(REPLACE
  "BOTTOM_LEFT_ASSUMED"
  "BOTTOM_LEFT"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)
string(REPLACE
  "5. Current code assumes this is bottom-left"
  "6. Real bottom-left found"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)
string(REPLACE
  "5. Текущий код считает эту точку нижним левым углом"
  "6. Найден настоящий нижний левый угол"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)

set(GENERATED_OCR_SOURCE "${CMAKE_CURRENT_BINARY_DIR}/ocr_cpp.generated.cpp")
file(WRITE "${GENERATED_OCR_SOURCE}" "${OCR_SOURCE_CONTENT}")

add_executable(ocr_cpp "${GENERATED_OCR_SOURCE}")

target_include_directories(
  ocr_cpp
  PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/packages/nlohmann.json.3.12.0/build/native/include"
)

target_link_libraries(
  ocr_cpp
  PRIVATE
    Tesseract::libtesseract
    Shcore
)

if(MSVC)
  target_compile_options(ocr_cpp PRIVATE /utf-8)
  set_property(
    TARGET ocr_cpp
    PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>"
  )
endif()
