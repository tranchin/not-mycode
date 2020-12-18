// @flow
import qrcode from "../../libs/qrcode"

export type qrCodeOptions = {
	padding: number, //options.padding || 4,
	width: number, //options.width || 256,
	height: number, //options.height || 256,
	typeNumber: number, //options.typeNumber || 0, // Use 0 for auto detect depending on input data length (size)
	color: string, //options.color || "#fff",
	background: string, //options.background || "#000",
	ecl: string,// options.ecl || "M",
	container: string, //options.container || "svg",
	content: string, //options.content
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
	return qrcodeGenerator.createSvgTag()

	// var modules = qrcodeGenerator.modules
	//
	// var width = options.width
	// var height = options.height
	// var length = modules.length;
	// var xsize = width / (length + 2 * options.padding);
	// var ysize = height / (length + 2 * options.padding);
	//
	// //Background rectangle
	// var bgrect = '<rect x="0" y="0" width="' + width + '" height="' + height + '" style="fill:' + options.background
	// 	+ ';shape-rendering:optimizeSpeed;"></rect>';
	//
	// //Rectangles representing modules
	// var modrect = '';
	// var pathdata = '';
	//
	// for (var y = 0; y < length; y++) {
	// 	for (var x = 0; x < length; x++) {
	// 		var module = modules[x][y];
	// 		if (module) {
	//
	// 			var px = (x * xsize + options.padding * xsize);
	// 			var py = (y * ysize + options.padding * ysize);
	//
	// 			//Module as a part of svg path data, thanks to @danioso
	// 			var w = xsize + px
	// 			var h = ysize + py
	//
	// 			px = (Number.isInteger(px)) ? Number(px) : px.toFixed(2);
	// 			py = (Number.isInteger(py)) ? Number(py) : py.toFixed(2);
	// 			w = (Number.isInteger(w)) ? Number(w) : w.toFixed(2);
	// 			h = (Number.isInteger(h)) ? Number(h) : h.toFixed(2);
	//
	// 			pathdata += ('M' + px + ',' + py + ' V' + h + ' H' + w + ' V' + py + ' H' + px + ' Z ');
	// 		}
	// 	}
	// }
	//
	//
	// modrect = '<path x="0" y="0" style="fill:' + options.color + ';shape-rendering:optimizeSpeed;" d="' + pathdata + '" />';
	//
	// var svg = "";
	// switch (options.container) {
	// 	//Wrapped in SVG document
	// 	case "svg":
	// 		svg += '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' + width + '" height="' + height + '">';
	// 		svg += bgrect + modrect;
	// 		svg += '</svg>';
	// 		break;
	//
	// 	//Viewbox for responsive use in a browser, thanks to @danioso
	// 	case "svg-viewbox":
	// 		svg += '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ' + width + ' ' + height + '">';
	// 		svg += bgrect + modrect;
	// 		svg += '</svg>';
	// 		break;
	//
	//
	// 	//Wrapped in group element
	// 	case "g":
	// 		svg += '<g width="' + width + '" height="' + height + '">';
	// 		svg += bgrect + modrect;
	// 		svg += '</g>';
	// 		break;
	//
	// 	//Without a container
	// 	case "none":
	// 		svg += (bgrect + modrect).replace(/^\s+/, ""); //Clear indents on each line
	// 		break;
	// }
	//
	// return svg;
}
