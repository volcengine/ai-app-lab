#!/bin/bash

# Compile Chinese translations
echo "Compiling Chinese translations..."
msgfmt my_browser_use/i18n/locales/zh-CN/LC_MESSAGES/vefaas_browser_use.po -o my_browser_use/i18n/locales/zh-CN/LC_MESSAGES/vefaas_browser_use.mo

if [ $? -eq 0 ]; then
    echo "✅ Translation compilation successful!"
else
    echo "❌ Translation compilation failed!"
    exit 1
fi 