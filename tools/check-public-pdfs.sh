#!/bin/sh
# Fails if any PDF in public/ (or the files given) contains something that looks like a phone number.
# Owner rule: no phone number anywhere public. A hand-uploaded CV once skipped tools/make-public-cv.py.
# A "phone number" here: a run of digits and separators ( + ( ) space / . - ) holding 9 or more digits.
# Years like "2015 - 2020" (8 digits) pass. Needs pdftotext (poppler-utils).
set -eu
cd "$(dirname "$0")/.."
[ "$#" -gt 0 ] || set -- public/*.pdf
status=0
for f in "$@"; do
  [ -e "$f" ] || continue
  hits=$(pdftotext "$f" - | grep -oE '[+(0-9][0-9 ()/.+-]{7,}[0-9]' | tr -cd '0-9\n' | awk 'length >= 9' | wc -l)
  if [ "$hits" -gt 0 ]; then
    echo "::error file=$f::$f contains $hits phone-number-like run(s) of 9+ digits"
    status=1
  fi
done
[ "$status" -eq 0 ] && echo "No phone numbers in public PDFs."
exit "$status"
