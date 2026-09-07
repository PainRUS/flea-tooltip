#include <iostream>
#include <vector>
#include <stdexcept>
#include <fstream>
#include <memory>
#include <cstring>
#include <tesseract/baseapi.h>
#include <leptonica/allheaders.h>
#include <chrono>
#include <windows.h>
#include <shellscalingapi.h>
#pragma comment(lib, "Shcore.lib")
#include <thread>
#include <stdio.h>
#include <algorithm>
#include <regex>
#include <string>
#include <sstream>
#include <nlohmann/json.hpp>

using namespace std;
using json = nlohmann::json;

static short borderColorRed = 82;
static short borderColorGreen = 89;
static short borderColorBlue = 90;

// Debug mode only adds pauses and temporary drawing. When disabled, the
// original scanning path below runs without any visual/debug work.
static bool debugMode = false;
static int debugStepDelayMs = 800;
static bool debugRussian = false;

static const std::regex regexNewlineCRLF("\r\n");
static const std::regex regexNewlineLF("\n");
static const std::regex regexAtSymbol("@");

static HDC cachedDesktopDC = NULL;
static HWND cachedDesktopWindow = NULL;

struct PixelBuffer {
	vector<uint8_t> pixels;
	int x, y, width, height;
	int bytesPerPixel;
	int bytesPerScanLine;

	PixelBuffer()
		: x(0), y(0), width(0), height(0), bytesPerPixel(4), bytesPerScanLine(0) {}
};

static PixelBuffer cachedPixelBuffer;

class Image
{
private:
	vector<uint8_t> Pixels;
	uint32_t width, height;
	uint16_t BitsPerPixel;

	void Flip(void* In, void* Out, int width, int height, unsigned int Bpp);

public:
	explicit Image(HDC DC, int X, int Y, int Width, int Height);

	inline uint16_t GetBitsPerPixel() { return this->BitsPerPixel; }
	inline uint16_t GetBytesPerPixel() { return this->BitsPerPixel / 8; }
	inline uint16_t GetBytesPerScanLine() { return (this->BitsPerPixel / 8) * this->width; }
	inline int GetWidth() const { return this->width; }
	inline int GetHeight() const { return this->height; }
	inline const uint8_t* GetPixels() { return this->Pixels.data(); }
};

void Image::Flip(void* In, void* Out, int width, int height, unsigned int Bpp)
{
	unsigned long Chunk = (Bpp > 24 ? width * 4 : width * 3 + width % 4);
	unsigned char* Destination = static_cast<unsigned char*>(Out);
	unsigned char* Source = static_cast<unsigned char*>(In) + Chunk * (height - 1);

	while (Source != In)
	{
		memcpy(Destination, Source, Chunk);
		Destination += Chunk;
		Source -= Chunk;
	}
}

Image::Image(HDC DC, int X, int Y, int Width, int Height)
	: Pixels(), width(Width), height(Height), BitsPerPixel(32)
{
	BITMAP Bmp = { 0 };
	HBITMAP hBmp = reinterpret_cast<HBITMAP>(GetCurrentObject(DC, OBJ_BITMAP));

	if (GetObject(hBmp, sizeof(BITMAP), &Bmp) == 0)
		throw runtime_error("BITMAP DC NOT FOUND.");

	RECT area = { X, Y, X + Width, Y + Height };
	HWND Window = WindowFromDC(DC);
	GetClientRect(Window, &area);

	HDC MemDC = GetDC(nullptr);
	HDC SDC = CreateCompatibleDC(MemDC);
	HBITMAP hSBmp = CreateCompatibleBitmap(MemDC, width, height);
	DeleteObject(SelectObject(SDC, hSBmp));

	BitBlt(SDC, 0, 0, width, height, DC, X, Y, SRCCOPY);
	unsigned int data_size = ((width * BitsPerPixel + 31) / 32) * 4 * height;
	vector<uint8_t> Data(data_size);
	this->Pixels.resize(data_size);

	BITMAPINFO Info = {
		sizeof(BITMAPINFOHEADER),
		static_cast<long>(width),
		static_cast<long>(height),
		1,
		BitsPerPixel,
		BI_RGB,
		data_size,
		0, 0, 0, 0
	};
	GetDIBits(SDC, hSBmp, 0, height, &Data[0], &Info, DIB_RGB_COLORS);
	this->Flip(&Data[0], &Pixels[0], width, height, BitsPerPixel);

	DeleteDC(SDC);
	DeleteObject(hSBmp);
	ReleaseDC(nullptr, MemDC);
}

// -------------------------------------------------------------------------
// Debug overlay. It is created only for one debug step, then destroyed before
// the scanner performs the next screen capture. It therefore never becomes
// part of the OCR input.
// -------------------------------------------------------------------------

enum class DebugShapeType { Rect, Point, Line };

struct DebugShape {
	DebugShapeType type;
	LONG x1;
	LONG y1;
	LONG x2;
	LONG y2;
	COLORREF color;
};

struct DebugOverlayState {
	const vector<DebugShape>* shapes;
	const wstring* label;
	int virtualX;
	int virtualY;
};

static wstring debugText(const wchar_t* english, const wchar_t* russian) {
	return debugRussian ? wstring(russian) : wstring(english);
}

static wstring utf8ToWide(const string& value) {
	if (value.empty()) return L"";

	int required = MultiByteToWideChar(
		CP_UTF8,
		0,
		value.c_str(),
		static_cast<int>(value.size()),
		nullptr,
		0
	);
	if (required <= 0) return L"";

	wstring result(static_cast<size_t>(required), L'\0');
	MultiByteToWideChar(
		CP_UTF8,
		0,
		value.c_str(),
		static_cast<int>(value.size()),
		&result[0],
		required
	);
	return result;
}

static void debugLog(const string& message) {
	if (!debugMode) return;
	cout << "DEBUG|" << message << endl;
	fflush(stdout);
}

static LRESULT CALLBACK DebugOverlayWndProc(
	HWND hwnd,
	UINT msg,
	WPARAM wParam,
	LPARAM lParam
) {
	if (msg == WM_NCCREATE) {
		CREATESTRUCTW* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
		SetWindowLongPtrW(
			hwnd,
			GWLP_USERDATA,
			reinterpret_cast<LONG_PTR>(create->lpCreateParams)
		);
	}

	DebugOverlayState* state = reinterpret_cast<DebugOverlayState*>(
		GetWindowLongPtrW(hwnd, GWLP_USERDATA)
	);

	if (msg == WM_ERASEBKGND) return 1;

	if (msg == WM_PAINT) {
		PAINTSTRUCT ps;
		HDC hdc = BeginPaint(hwnd, &ps);

		RECT clientRect;
		GetClientRect(hwnd, &clientRect);
		HBRUSH transparentKeyBrush = CreateSolidBrush(RGB(0, 0, 0));
		FillRect(hdc, &clientRect, transparentKeyBrush);
		DeleteObject(transparentKeyBrush);

		if (state && state->shapes) {
			HGDIOBJ oldBrush = SelectObject(hdc, GetStockObject(NULL_BRUSH));

			for (const DebugShape& shape : *state->shapes) {
				HPEN pen = CreatePen(PS_SOLID, 3, shape.color);
				HGDIOBJ oldPen = SelectObject(hdc, pen);

				int x1 = static_cast<int>(shape.x1) - state->virtualX;
				int y1 = static_cast<int>(shape.y1) - state->virtualY;
				int x2 = static_cast<int>(shape.x2) - state->virtualX;
				int y2 = static_cast<int>(shape.y2) - state->virtualY;

				if (shape.type == DebugShapeType::Rect) {
					Rectangle(hdc, x1, y1, x2, y2);
				}
				else if (shape.type == DebugShapeType::Point) {
					Ellipse(hdc, x1 - 7, y1 - 7, x1 + 7, y1 + 7);
					MoveToEx(hdc, x1 - 11, y1, nullptr);
					LineTo(hdc, x1 + 11, y1);
					MoveToEx(hdc, x1, y1 - 11, nullptr);
					LineTo(hdc, x1, y1 + 11);
				}
				else {
					MoveToEx(hdc, x1, y1, nullptr);
					LineTo(hdc, x2, y2);
				}

				SelectObject(hdc, oldPen);
				DeleteObject(pen);
			}

			SelectObject(hdc, oldBrush);
		}

		if (state && state->label && !state->label->empty()) {
			RECT labelRect = { 20, 20, 860, 66 };
			HBRUSH labelBrush = CreateSolidBrush(RGB(35, 35, 35));
			FillRect(hdc, &labelRect, labelBrush);
			DeleteObject(labelBrush);

			SetBkMode(hdc, TRANSPARENT);
			SetTextColor(hdc, RGB(255, 255, 255));
			HGDIOBJ oldFont = SelectObject(hdc, GetStockObject(DEFAULT_GUI_FONT));
			TextOutW(
				hdc,
				30,
				34,
				state->label->c_str(),
				static_cast<int>(state->label->size())
			);
			SelectObject(hdc, oldFont);
		}

		EndPaint(hwnd, &ps);
		return 0;
	}

	return DefWindowProcW(hwnd, msg, wParam, lParam);
}

static bool ensureDebugOverlayClassRegistered() {
	static bool registered = false;
	if (registered) return true;

	WNDCLASSEXW wc = {};
	wc.cbSize = sizeof(WNDCLASSEXW);
	wc.lpfnWndProc = DebugOverlayWndProc;
	wc.hInstance = GetModuleHandleW(nullptr);
	wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
	wc.lpszClassName = L"FleaTooltipOcrDebugOverlay";

	if (RegisterClassExW(&wc) == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
		return false;
	}

	registered = true;
	return true;
}

static void showDebugStep(
	const vector<DebugShape>& shapes,
	const wstring& label
) {
	if (!debugMode || !ensureDebugOverlayClassRegistered()) return;

	int virtualX = GetSystemMetrics(SM_XVIRTUALSCREEN);
	int virtualY = GetSystemMetrics(SM_YVIRTUALSCREEN);
	int virtualWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
	int virtualHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

	DebugOverlayState state = { &shapes, &label, virtualX, virtualY };
	HWND overlay = CreateWindowExW(
		WS_EX_LAYERED |
		WS_EX_TRANSPARENT |
		WS_EX_TOPMOST |
		WS_EX_TOOLWINDOW |
		WS_EX_NOACTIVATE,
		L"FleaTooltipOcrDebugOverlay",
		L"",
		WS_POPUP,
		virtualX,
		virtualY,
		virtualWidth,
		virtualHeight,
		nullptr,
		nullptr,
		GetModuleHandleW(nullptr),
		&state
	);

	if (!overlay) return;

	SetLayeredWindowAttributes(overlay, RGB(0, 0, 0), 0, LWA_COLORKEY);
	SetWindowPos(
		overlay,
		HWND_TOPMOST,
		virtualX,
		virtualY,
		virtualWidth,
		virtualHeight,
		SWP_NOACTIVATE | SWP_SHOWWINDOW
	);
	UpdateWindow(overlay);

	std::this_thread::sleep_for(std::chrono::milliseconds(debugStepDelayMs));

	DestroyWindow(overlay);
}

// -------------------------------------------------------------------------
// Original scanner helpers
// -------------------------------------------------------------------------

static bool pixelIsBorderColor(short& red, short& green, short& blue) {
	return red == borderColorRed &&
		green == borderColorGreen &&
		blue == borderColorBlue;
}

static bool capturePixelRegion(
	HDC dc,
	int x,
	int y,
	int width,
	int height,
	bool forceRecapture = false
) {
	if (!forceRecapture &&
		cachedPixelBuffer.x == x &&
		cachedPixelBuffer.y == y &&
		cachedPixelBuffer.width == width &&
		cachedPixelBuffer.height == height &&
		!cachedPixelBuffer.pixels.empty()) {
		return true;
	}

	cachedPixelBuffer.x = x;
	cachedPixelBuffer.y = y;
	cachedPixelBuffer.width = width;
	cachedPixelBuffer.height = height;
	cachedPixelBuffer.bytesPerPixel = 4;
	cachedPixelBuffer.bytesPerScanLine = ((width * 32 + 31) / 32) * 4;

	unsigned int data_size = cachedPixelBuffer.bytesPerScanLine * height;
	cachedPixelBuffer.pixels.resize(data_size);

	HDC MemDC = GetDC(nullptr);
	if (MemDC == NULL) {
		cerr << "ERROR: Failed to get memory device context" << endl;
		cachedPixelBuffer.pixels.clear();
		return false;
	}

	HDC SDC = CreateCompatibleDC(MemDC);
	if (SDC == NULL) {
		cerr << "ERROR: Failed to create compatible DC" << endl;
		ReleaseDC(nullptr, MemDC);
		cachedPixelBuffer.pixels.clear();
		return false;
	}

	HBITMAP hSBmp = CreateCompatibleBitmap(MemDC, width, height);
	if (hSBmp == NULL) {
		cerr << "ERROR: Failed to create compatible bitmap" << endl;
		DeleteDC(SDC);
		ReleaseDC(nullptr, MemDC);
		cachedPixelBuffer.pixels.clear();
		return false;
	}

	DeleteObject(SelectObject(SDC, hSBmp));

	if (!BitBlt(SDC, 0, 0, width, height, dc, x, y, SRCCOPY)) {
		cerr << "ERROR: BitBlt failed during pixel capture" << endl;
		DeleteDC(SDC);
		DeleteObject(hSBmp);
		ReleaseDC(nullptr, MemDC);
		cachedPixelBuffer.pixels.clear();
		return false;
	}

	BITMAPINFO Info = {
		sizeof(BITMAPINFOHEADER),
		static_cast<long>(width),
		static_cast<long>(height),
		1,
		32,
		BI_RGB,
		data_size,
		0, 0, 0, 0
	};

	if (GetDIBits(
		SDC,
		hSBmp,
		0,
		height,
		cachedPixelBuffer.pixels.data(),
		&Info,
		DIB_RGB_COLORS
	) == 0) {
		cerr << "ERROR: GetDIBits failed during pixel capture" << endl;
		DeleteDC(SDC);
		DeleteObject(hSBmp);
		ReleaseDC(nullptr, MemDC);
		cachedPixelBuffer.pixels.clear();
		return false;
	}

	unsigned long Chunk = cachedPixelBuffer.bytesPerScanLine;
	vector<uint8_t> flipped(data_size);
	unsigned char* Destination = flipped.data();
	unsigned char* Source =
		cachedPixelBuffer.pixels.data() + Chunk * (height - 1);

	while (Source >= cachedPixelBuffer.pixels.data()) {
		memcpy(Destination, Source, Chunk);
		Destination += Chunk;
		Source -= Chunk;
	}
	cachedPixelBuffer.pixels = std::move(flipped);

	DeleteDC(SDC);
	DeleteObject(hSBmp);
	ReleaseDC(nullptr, MemDC);
	return true;
}

static bool getPixelFromBuffer(
	int x,
	int y,
	short& red,
	short& green,
	short& blue
) {
	int relX = x - cachedPixelBuffer.x;
	int relY = y - cachedPixelBuffer.y;

	if (relX < 0 ||
		relY < 0 ||
		relX >= cachedPixelBuffer.width ||
		relY >= cachedPixelBuffer.height) {
		return false;
	}

	int offset =
		(relY * cachedPixelBuffer.bytesPerScanLine) +
		(relX * cachedPixelBuffer.bytesPerPixel);

	if (offset + 2 >= static_cast<int>(cachedPixelBuffer.pixels.size())) {
		return false;
	}

	blue = cachedPixelBuffer.pixels[offset];
	green = cachedPixelBuffer.pixels[offset + 1];
	red = cachedPixelBuffer.pixels[offset + 2];
	return true;
}

static bool pixelIsValid(
	short startingX,
	short startingY,
	short& red,
	short& green,
	short& blue,
	short offsetX = 0,
	short offsetY = 0
) {
	LONG x = startingX + offsetX;
	LONG y = startingY + offsetY;

	if (getPixelFromBuffer(x, y, red, green, blue)) {
		return pixelIsBorderColor(red, green, blue);
	}

	if (cachedDesktopDC) {
		COLORREF color = GetPixel(cachedDesktopDC, x, y);
		if (color == CLR_INVALID) return false;

		red = GetRValue(color);
		green = GetGValue(color);
		blue = GetBValue(color);
		return pixelIsBorderColor(red, green, blue);
	}

	return false;
}

static void getBottomRightBorderPoint(
	short startingX,
	short startingY,
	short& red,
	short& green,
	short& blue,
	short& offsetX,
	short checkRange
) {
	offsetX += checkRange;

	while (pixelIsValid(startingX, startingY, red, green, blue, offsetX)) {
		offsetX += checkRange;
	}

	offsetX -= checkRange;
}

static void getTopLeftBorderPoint(
	short startingX,
	short startingY,
	short& red,
	short& green,
	short& blue,
	short& offsetY,
	short checkRange
) {
	offsetY += checkRange;

	while (pixelIsValid(startingX, startingY, red, green, blue, 0, offsetY)) {
		offsetY += checkRange;
	}

	offsetY -= checkRange;
}

static std::string scanForText(
	tesseract::TessBaseAPI& tess,
	int x1,
	int y1,
	int width,
	int height
) {
	std::string result;
	if (!cachedDesktopDC) return result;

	Image img(cachedDesktopDC, x1, y1, width, height);
	tess.SetImage(
		img.GetPixels(),
		img.GetWidth(),
		img.GetHeight(),
		img.GetBytesPerPixel(),
		img.GetBytesPerScanLine()
	);

	char* utf8 = tess.GetUTF8Text();
	if (utf8) {
		result.assign(utf8);
		delete[] utf8;
	}
	return result;
}

static void rtrim(std::string& s) {
	const std::string whitespaces = " \t\n\r\f\v";
	size_t last_non_space = s.find_last_not_of(whitespaces);

	if (last_non_space != std::string::npos) {
		s.erase(last_non_space + 1);
	}
	else {
		s.clear();
	}
}

int main(int argc, char* argv[])
{
	SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);

	if (argc >= 4) {
		try {
			borderColorRed = static_cast<short>(std::stoi(argv[1]));
			borderColorGreen = static_cast<short>(std::stoi(argv[2]));
			borderColorBlue = static_cast<short>(std::stoi(argv[3]));
		}
		catch (const std::exception&) {
			std::cerr <<
				"Error parsing color arguments. Using default values." <<
				std::endl;
		}
	}

	// Language is explicit: eng or rus. The scanner never guesses it.
	std::string ocrLanguage = "eng";
	if (argc >= 5) {
		std::string requestedLanguage = argv[4];
		if (requestedLanguage == "eng" || requestedLanguage == "rus") {
			ocrLanguage = requestedLanguage;
		}
	}
	debugRussian = ocrLanguage == "rus";

	if (argc >= 6) {
		debugMode = std::string(argv[5]) == "1";
	}
	if (argc >= 7) {
		try {
			debugStepDelayMs = std::stoi(argv[6]);
			if (debugStepDelayMs < 100) debugStepDelayMs = 100;
			if (debugStepDelayMs > 2000) debugStepDelayMs = 2000;
		}
		catch (const std::exception&) {
			debugStepDelayMs = 800;
		}
	}

	short CURSOR_TOOLTIP_OFFSET_X{};
	short CURSOR_TOOLTIP_OFFSET_Y{};

	WCHAR exe_path[MAX_PATH];
	GetModuleFileNameW(NULL, exe_path, MAX_PATH);
	std::wstring ws_exe_path(exe_path);
	std::wstring exe_dir =
		ws_exe_path.substr(0, ws_exe_path.find_last_of(L"\\/"));

	std::ifstream file(exe_dir + L"\\scanningConfig.json");
	if (!file.is_open()) {
		cout << "IGNORE||NO CONFIG FILE FOUND" << endl;
		CURSOR_TOOLTIP_OFFSET_X = 13;
		CURSOR_TOOLTIP_OFFSET_Y = -13;
	}
	else {
		cout << "IGNORE||CONFIG FILE FOUND" << endl;
		json data = json::parse(file);
		file.close();
		CURSOR_TOOLTIP_OFFSET_X = data["offsetX"];
		CURSOR_TOOLTIP_OFFSET_Y = data["offsetY"];
	}

	cachedDesktopWindow = GetDesktopWindow();
	cachedDesktopDC = GetDC(cachedDesktopWindow);
	if (!cachedDesktopDC) {
		cerr << "Failed to get desktop DC" << endl;
		return 1;
	}

	tesseract::TessBaseAPI tess;
	if (tess.Init(NULL, ocrLanguage.c_str()) != 0) {
		cerr << "Failed to initialize Tesseract language: " <<
			ocrLanguage << endl;
		tess.End();
		ReleaseDC(cachedDesktopWindow, cachedDesktopDC);
		return 1;
	}

	tess.SetPageSegMode(tesseract::PSM_SINGLE_BLOCK);
	if (ocrLanguage == "eng") {
		// This is the original English optimization. It is not applied in Russian
		// mode because it would prevent Cyrillic recognition.
		tess.SetVariable(
			"tessedit_char_whitelist",
			"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,$€₽@- "
		);
	}
	tess.SetVariable("classify_bln_numeric_mode", "1");

	static POINT lastScannedCursor = { 0, 0 };

	string scanText{};
	short checkRange = 50;
	short red = 0;
	short green = 0;
	short blue = 0;
	POINT mousePos{};
	POINT lastValidMousePos{};
	POINT bottomLeftBorderPoint{};
	LONG width = 0;
	LONG height = 0;
	short offsetX = 0;
	short offsetY = 0;
	POINT bottomRightBorderPoint{};
	POINT topLeftBorderPoint{};
	short mouseStationaryCount = 0;
	bool foundTooltip = false;
	bool borderIsVisible = false;
	bool showedMouseMoved = false;

	short horizontalCheckpoints[3] = { 50, 15, 5 };
	short verticalCheckpoints[3] = { -15, -5, -2 };
	int sleepInterval = 25;

	while (true) {
		if (GetCursorPos(&mousePos)) {
			if (
				lastValidMousePos.x == mousePos.x &&
				lastValidMousePos.y == mousePos.y
			) {
				mouseStationaryCount++;
				sleepInterval = 25;
			}
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

			bottomLeftBorderPoint.x =
				mousePos.x + CURSOR_TOOLTIP_OFFSET_X;
			bottomLeftBorderPoint.y =
				mousePos.y + CURSOR_TOOLTIP_OFFSET_Y;

			bool alreadyScanned =
				mousePos.x == lastScannedCursor.x &&
				mousePos.y == lastScannedCursor.y;

			if (mouseStationaryCount > 2 && !foundTooltip && !alreadyScanned) {
				// Keep the original 600x300 search capture unchanged. The point of
				// debug mode is to see its real coverage before deciding how to fix it.
				int captureX = bottomLeftBorderPoint.x - 100;
				int captureY = bottomLeftBorderPoint.y - 200;
				int captureWidth = 600;
				int captureHeight = 300;

				if (captureX < 0) captureX = 0;
				if (captureY < 0) captureY = 0;

				capturePixelRegion(
					cachedDesktopDC,
					captureX,
					captureY,
					captureWidth,
					captureHeight,
					true
				);

				vector<DebugShape> debugShapes;
				if (debugMode) {
					debugShapes.push_back({
						DebugShapeType::Rect,
						captureX,
						captureY,
						captureX + captureWidth,
						captureY + captureHeight,
						RGB(0, 220, 255)
					});

					ostringstream logLine;
					logLine << "CAPTURE|" << captureX << "|" << captureY <<
						"|" << captureWidth << "|" << captureHeight;
					debugLog(logLine.str());
					showDebugStep(
						debugShapes,
						debugText(
							L"1. Captured search area (600 x 300)",
							L"1. Снята область поиска (600 x 300)"
						)
					);
				}

				auto testBorderPoint = [&]
				(
					LONG x,
					LONG y,
					const wstring& stageLabel,
					const string& logName
				) -> bool {
					bool matched = pixelIsValid(
						static_cast<short>(x),
						static_cast<short>(y),
						red,
						green,
						blue
					);

					if (debugMode) {
						debugShapes.push_back({
							DebugShapeType::Point,
							x, y, x, y,
							matched ? RGB(0, 255, 80) : RGB(255, 70, 70)
						});

						ostringstream logLine;
						logLine << logName << "|" << x << "|" << y << "|" <<
							(matched ? "MATCH" : "MISS");
						debugLog(logLine.str());

						wstring resultLabel = stageLabel +
							(matched
								? debugText(
									L" - border color matched",
									L" - цвет рамки совпал"
								)
								: debugText(
									L" - different color",
									L" - другой цвет"
								));
						showDebugStep(debugShapes, resultLabel);
					}

					return matched;
				};

				if (testBorderPoint(
					bottomLeftBorderPoint.x,
					bottomLeftBorderPoint.y,
					debugText(
						L"2. Testing configured start pixel",
						L"2. Проверка стартового пикселя"
					),
					"START_PIXEL"
				)) {
					borderIsVisible = true;
				}
				else if (testBorderPoint(
					bottomLeftBorderPoint.x + 1,
					bottomLeftBorderPoint.y - 1,
					debugText(
						L"3. Testing +1 / -1 fallback",
						L"3. Проверка запасной точки +1 / -1"
					),
					"FALLBACK_PLUS"
				)) {
					bottomLeftBorderPoint.x++;
					bottomLeftBorderPoint.y--;
					borderIsVisible = true;
				}
				else if (testBorderPoint(
					bottomLeftBorderPoint.x - 1,
					bottomLeftBorderPoint.y + 1,
					debugText(
						L"4. Testing -1 / +1 fallback",
						L"4. Проверка запасной точки -1 / +1"
					),
					"FALLBACK_MINUS"
				)) {
					bottomLeftBorderPoint.x--;
					bottomLeftBorderPoint.y++;
					borderIsVisible = true;
				}

				if (borderIsVisible) {
					borderIsVisible = false;
					offsetX = 0;
					offsetY = 0;
					foundTooltip = true;

					if (debugMode) {
						debugShapes.push_back({
							DebugShapeType::Point,
							bottomLeftBorderPoint.x,
							bottomLeftBorderPoint.y,
							bottomLeftBorderPoint.x,
							bottomLeftBorderPoint.y,
							RGB(255, 220, 0)
						});

						ostringstream logLine;
						logLine << "BOTTOM_LEFT_ASSUMED|" <<
							bottomLeftBorderPoint.x << "|" <<
							bottomLeftBorderPoint.y;
						debugLog(logLine.str());

						showDebugStep(
							debugShapes,
							debugText(
								L"5. Current code assumes this is bottom-left",
								L"5. Текущий код считает эту точку нижним левым углом"
							)
						);
					}

					for (short i = 0; i < std::size(horizontalCheckpoints); i++) {
						checkRange = horizontalCheckpoints[i];
						getBottomRightBorderPoint(
							bottomLeftBorderPoint.x,
							bottomLeftBorderPoint.y,
							red,
							green,
							blue,
							offsetX,
							checkRange
						);

						if (debugMode) {
							LONG currentRightX =
								bottomLeftBorderPoint.x + offsetX;
							debugShapes.push_back({
								DebugShapeType::Line,
								bottomLeftBorderPoint.x,
								bottomLeftBorderPoint.y,
								currentRightX,
								bottomLeftBorderPoint.y,
								RGB(255, 170, 0)
							});

							ostringstream logLine;
							logLine << "RIGHT_SEARCH|step=" << checkRange <<
								"|x=" << currentRightX;
							debugLog(logLine.str());

							wstringstream label;
							label << debugText(
								L"Searching right border, checkpoint ",
								L"Поиск правой границы, шаг "
							) << checkRange << L" px";
							showDebugStep(debugShapes, label.str());
						}
					}

					bottomRightBorderPoint.x =
						bottomLeftBorderPoint.x + offsetX;
					bottomRightBorderPoint.y = bottomLeftBorderPoint.y;

					for (short i = 0; i < std::size(verticalCheckpoints); i++) {
						checkRange = verticalCheckpoints[i];
						getTopLeftBorderPoint(
							bottomLeftBorderPoint.x,
							bottomLeftBorderPoint.y,
							red,
							green,
							blue,
							offsetY,
							checkRange
						);

						if (debugMode) {
							LONG currentTopY =
								bottomLeftBorderPoint.y + offsetY;
							debugShapes.push_back({
								DebugShapeType::Line,
								bottomLeftBorderPoint.x,
								bottomLeftBorderPoint.y,
								bottomLeftBorderPoint.x,
								currentTopY,
								RGB(255, 80, 220)
							});

							ostringstream logLine;
							logLine << "TOP_SEARCH|step=" << checkRange <<
								"|y=" << currentTopY;
							debugLog(logLine.str());

							wstringstream label;
							label << debugText(
								L"Searching top border, checkpoint ",
								L"Поиск верхней границы, шаг "
							) << checkRange << L" px";
							showDebugStep(debugShapes, label.str());
						}
					}

					topLeftBorderPoint.x = bottomLeftBorderPoint.x;
					topLeftBorderPoint.y =
						bottomLeftBorderPoint.y + offsetY;

					width =
						bottomRightBorderPoint.x - bottomLeftBorderPoint.x;
					height =
						bottomLeftBorderPoint.y - topLeftBorderPoint.y;

					if (debugMode) {
						debugShapes.push_back({
							DebugShapeType::Rect,
							topLeftBorderPoint.x + 1,
							topLeftBorderPoint.y + 1,
							topLeftBorderPoint.x + 1 + width,
							topLeftBorderPoint.y + 1 + height,
							RGB(255, 255, 255)
						});

						ostringstream logLine;
						logLine << "OCR_RECT|" <<
							(topLeftBorderPoint.x + 1) << "|" <<
							(topLeftBorderPoint.y + 1) << "|" <<
							width << "|" << height;
						debugLog(logLine.str());

						wstringstream label;
						label << debugText(
							L"Final OCR rectangle: ",
							L"Итоговая область OCR: "
						) << width << L" x " << height;
						showDebugStep(debugShapes, label.str());
					}

					if (width > 10 && height > 10) {
						// Any debug window from the previous step has already been
						// destroyed, so this is the same clean capture as normal mode.
						scanText = scanForText(
							tess,
							topLeftBorderPoint.x + 1,
							topLeftBorderPoint.y + 1,
							width,
							height
						);

						scanText = regex_replace(
							scanText,
							regexNewlineCRLF,
							" "
						);
						scanText = regex_replace(
							scanText,
							regexNewlineLF,
							" "
						);
						scanText = regex_replace(
							scanText,
							regexAtSymbol,
							"0"
						);
						rtrim(scanText);

						if (debugMode) {
							debugLog(string("OCR_TEXT|") + scanText);

							wstring recognized = utf8ToWide(scanText);
							if (recognized.size() > 100) {
								recognized.resize(100);
								recognized += L"...";
							}

							showDebugStep(
								debugShapes,
								debugText(
									L"OCR recognized: ",
									L"OCR распознал: "
								) + recognized
							);
						}

						if (scanText.length() > 3) {
							lastScannedCursor = mousePos;
							cout << scanText << "||" <<
								mousePos.x << "," << mousePos.y << endl;
							fflush(stdout);
							showedMouseMoved = false;
						}
					}
				}
				else if (debugMode) {
					ostringstream logLine;
					logLine << "BORDER_NOT_FOUND|" <<
						bottomLeftBorderPoint.x << "|" <<
						bottomLeftBorderPoint.y;
					debugLog(logLine.str());

					showDebugStep(
						debugShapes,
						debugText(
							L"No tooltip border found at the three current test pixels",
							L"Рамка плашки не найдена в трёх текущих проверяемых точках"
						)
					);
				}
			}

			lastValidMousePos = mousePos;
		}

		std::this_thread::sleep_for(std::chrono::milliseconds(sleepInterval));
	}

	// Unreachable during normal operation, kept for orderly shutdown semantics.
	tess.End();
	ReleaseDC(cachedDesktopWindow, cachedDesktopDC);
	return 0;
}
