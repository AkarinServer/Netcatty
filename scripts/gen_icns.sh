# 1) 准备一张 1024x1024 PNG，例如放在 public/dmg-fix-icon.png
# 2) 生成 iconset 并转 icns
ICONSET="scripts/fixquarantine.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" public/dmg-fix-icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size*2))" "$((size*2))" public/dmg-fix-icon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o scripts/FixQuarantine.app/Contents/Resources/FixQuarantine.icns
rm -rf $ICONSET
