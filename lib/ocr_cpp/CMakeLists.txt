cmake_minimum_required(VERSION 3.20)
project(FleaTooltipOCR LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Tesseract CONFIG REQUIRED)

add_executable(ocr_cpp ocr_cpp.cpp)

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
