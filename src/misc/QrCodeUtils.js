// @flow
import qrcode from "../../libs/qrcode"

export type qrCodeOptions = {
	padding: number,
	width: number,
	height: number,
	typeNumber: number, // Use 0 for auto detect depending on input data length (size)
	fill: string,
	background: string,
	ecl: string,
	container: string,
	content: string,
};

/** Generates QR Code as SVG image */
export function getQRCodeSvg(options: qrCodeOptions): string {


	//Gets text length
	function _getUTF8Length(content) {
		var result = encodeURI(content).toString().replace(/\%[0-9a-fA-F]{2}/g, 'a');
		return result.length + (result.length != content ? 3 : 0);
	}

	//Generate QR Code matrix
	var content = options.content
	var qrcodeGenerator = qrcode(options.typeNumber, options.ecl)
	qrcodeGenerator.addData(content)
	qrcodeGenerator.make()
	return qrcodeGenerator.createSvgPath({
		// Round to two decimals
		cellSize: Math.round(options.width / (qrcodeGenerator.getModuleCount() + 2 * options.padding) * 100) / 100,
		background: null,
		fill: options.fill,
		scalable: true,
		padding: options.padding
	})
}
