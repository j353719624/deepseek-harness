#!/bin/sh
# Rebuild the slim + patched Linux deb from a staging tree.
# Usage: build-deb.sh <stage-dir> <version> <out-file>
#   <stage-dir> must already contain the pruned payload + DEBIAN/ (control, md5sums, postinst, prerm)
set -eu
STAGE=$1; VERSION=$2; OUT=$3
[ -d "$STAGE/DEBIAN" ] || { echo "no DEBIAN/ in $STAGE" >&2; exit 1; }
cp packaging/updates/app-update.yml "$STAGE/opt/dsh-desktop/resources/app-update.yml"
cp packaging/updates/package-type   "$STAGE/opt/dsh-desktop/resources/package-type"
cd "$STAGE"
sed -i "s/^Version:.*$/Version: $VERSION/" DEBIAN/control
sed -i "s/^Installed-Size:.*$/Installed-Size: $(du -ks --exclude=DEBIAN . | cut -f1)/" DEBIAN/control
chmod 755 DEBIAN/postinst DEBIAN/prerm
find . -path ./DEBIAN -prune -o -type f -print0 | sort -z | xargs -0 md5sum | sed 's|  \./|  |' > DEBIAN/md5sums
md5sum -c --quiet DEBIAN/md5sums
dpkg-deb --build --root-owner-group --threads-max=8 -Zxz -z6 . "$OUT"
sha256sum "$OUT"
