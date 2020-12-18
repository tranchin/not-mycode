// @flow

// flowlint untyped-import:off
import qrcode from "../../libs/qrcode"
// flowlint untyped-import:error

export type qrCodeOptions = {
	size: number,
	content: string,
	padding?: number,
	typeNumber?: number, // Use 0 for auto detect depending on input data length (size)
	fill?: string,
	background?: string,
	ecl?: 'L' | 'M' | 'Q' | 'H',
	scalable?: boolean;
};

/** Generates QR Code as SVG image */
export function getQRCodeSvgPath(options: qrCodeOptions): string {

	let content = options.content
	let padding = options.padding || 0
	let qrcodeGenerator = qrcode(options.typeNumber || 0, options.ecl || "M")
	qrcodeGenerator.addData(content)
	qrcodeGenerator.make()

	let cellSize = (options.size) / (qrcodeGenerator.getModuleCount())

	return qrcodeGenerator.createSvgPath({
		// Round to two decimals
		cellSize: Math.round(cellSize * 100 - 50) / 100,
		background: options.background,
		fill: options.fill,
	})
}


/** Generates QR Code as SVG image */
export function getQRCodeSvg(options: qrCodeOptions): string {

	var content = options.content
	let padding = options.padding || 0
	var qrcodeGenerator = qrcode(options.typeNumber || 0, options.ecl || "M")
	qrcodeGenerator.addData(content)
	qrcodeGenerator.make()
	let cellSize = (options.size - 2 * padding) / (qrcodeGenerator.getModuleCount())

	return qrcodeGenerator.createSvgTag({
		// Round to two decimals
		cellSize: Math.round(cellSize * 100 - 50) / 100,
		background: options.background,
		fill: options.fill,
		scalable: options.scalable || false,
		padding: options.padding
	})
}
