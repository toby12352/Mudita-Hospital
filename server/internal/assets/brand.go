package assets

import _ "embed"

// LogoPNG is the default Mudita Hospital brand mark used on receipts
// when no custom logo_path is configured.
//
//go:embed logo.png
var LogoPNG []byte
