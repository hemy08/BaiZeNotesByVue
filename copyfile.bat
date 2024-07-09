rmdir /S /Q /Y "out\renderer\src\lib"
mkdir "out\renderer\src\lib"
xcopy /S /E /Y /I "src\renderer\src\lib" "out\renderer\src\lib"

rmdir /S /Q /Y "out\renderer\src\dialogs"
mkdir "out\renderer\src\dialogs"
xcopy /S /E /Y /I "src\renderer\src\dialogs" "out\renderer\src\dialogs"
