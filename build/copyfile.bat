rmdir /S /Q "out\renderer\src\lib" 2>nul
mkdir "out\renderer\src\lib"
xcopy /S /E /Y /I "src\renderer\src\lib" "out\renderer\src\lib"

rmdir /S /Q "out\renderer\src\dialogs" 2>nul
mkdir "out\renderer\src\dialogs"
xcopy /S /E /Y /I "src\renderer\src\dialogs" "out\renderer\src\dialogs"

rmdir /S /Q "out\renderer\src\style" 2>nul
mkdir "out\renderer\src\style"
xcopy /S /E /Y /I "src\renderer\src\style" "out\renderer\src\style"

rmdir /S /Q "out\themes" 2>nul
mkdir "out\themes"
xcopy /S /E /Y /I "resources\themes" "out\themes"

rmdir /S /Q "out\icon" 2>nul
mkdir "out\icon"
xcopy /S /E /Y /I "resources\icon" "out\icon"

rmdir /S /Q "out\config" 2>nul
mkdir "out\config"
xcopy /S /E /Y /I "resources\config" "out\config"

rmdir /S /Q "out\mermaid" 2>nul
mkdir "out\mermaid"
xcopy /S /E /Y /I "node_modules\mermaid\dist" "out\mermaid"

rmdir /S /Q "out\katex" 2>nul
mkdir "out\katex"
xcopy /S /E /Y /I "node_modules\katex\dist" "out\katex"
