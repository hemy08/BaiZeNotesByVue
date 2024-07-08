if exist "out\renderer\src\lib" (
  rmdir /S /Q out\renderer\src\lib
  xcopy /S /E src\renderer\src\lib out\renderer\src\lib /Y
)
