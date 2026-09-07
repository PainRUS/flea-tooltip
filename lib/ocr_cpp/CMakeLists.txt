cmake_minimum_required(VERSION 3.20)
project(FleaTooltipOCR LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Tesseract CONFIG REQUIRED)

# The Electron side intentionally keeps a simple two-value language setting:
# `eng` for English and `rus` for Russian. Tarkov's Russian item names contain
# many Latin model names/calibers (FN SCAR-L, AR-15, FDE, 5.56x45, etc.), so a
# Russian scan must load both Tesseract models. Generate the build source with
# that one native-language mapping while leaving scanner geometry untouched.
set(OCR_SOURCE "${CMAKE_CURRENT_SOURCE_DIR}/ocr_cpp.cpp")
file(READ "${OCR_SOURCE}" OCR_SOURCE_CONTENT)

string(FIND "${OCR_SOURCE_CONTENT}" "ocrLanguage = requestedLanguage;" OCR_LANGUAGE_ASSIGNMENT_POS)
if(OCR_LANGUAGE_ASSIGNMENT_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR language assignment was not found in ocr_cpp.cpp")
endif()

string(FIND "${OCR_SOURCE_CONTENT}" "debugRussian = ocrLanguage == \"rus\";" OCR_DEBUG_LANGUAGE_POS)
if(OCR_DEBUG_LANGUAGE_POS EQUAL -1)
  message(FATAL_ERROR "Expected OCR debug language assignment was not found in ocr_cpp.cpp")
endif()

string(REPLACE
  "ocrLanguage = requestedLanguage;"
  "ocrLanguage = requestedLanguage == \"rus\" ? \"rus+eng\" : requestedLanguage;"
  OCR_SOURCE_CONTENT
  "${OCR_SOURCE_CONTENT}"
)
string(REPLACE
  "debugRussian = ocrLanguage == \"rus\";"
  "debugRussian = ocrLanguage.find(\"rus\") != std::string::npos;"
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
