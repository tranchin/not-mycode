import stream from "mithril/stream"
import Mithril from "mithril"
import Hammer from "hammerjs"

enum MoveDirection {
	X,
	Y,
}

type CoordinatePair = {
	x: number
	y: number
}

export class PinchZoomV2 {
	private evCache: PointerEvent[] = []
	private touchCount = 0
	// pinching
	private prevDiff = -1
	private maxScale = -1
	private minScale = -1
	private currentScale = -1
	private xMiddle = -1
	private yMiddle = -1
	private pinchTouchIDs: Set<number> = new Set<number>()

	// dragging
	private dragTouchIDs: Set<number> = new Set<number>()
	private offsetX = -1
	private offsetY = -1
	private startX = -1
	private startY = -1
	private currentX = -1
	private currentY = -1
	private lastOffsetX = 0 //what should be the default that can never be reached be?
	private lastOffsetY = 0
	private currentTransformOrigin: CoordinatePair = { x: 0, y: 0 }
	private lastTransformOrigin: CoordinatePair = { x: 0, y: 0 }
	private transformOriginNotInitialized = true

	private topScrollValue: number = 0

	constructor(private readonly root: HTMLElement, private readonly parent: HTMLElement) {
		// console.log("new Pinch to zoom----------------")
		// this.setInitialScale(1)
		// this.root.ontouchend = (e) => {
		// 	this.removeTouches()
		// 	// console.log("touch end")
		// }
		// this.root.ontouchmove = (e) => {
		// 	this.touchmove_handler(e)
		// 	// console.log("touch move")
		// }
		// this.root.ontouchcancel = (e) => {
		// 	this.removeTouches()
		// 	// console.log("touch cancel")
		// }

		////// new
		const outerThis = this
		let hammer = new Hammer(this.root, {})

		hammer.get("pinch").set({ enable: true })
		hammer.get("pan").set({ threshold: 0 })

		// @ts-ignore
		hammer.on("doubletap", function (e) {
			let scaleFactor = 1
			if (outerThis.current.zooming === false) {
				outerThis.current.zooming = true
			} else {
				outerThis.current.zooming = false
				scaleFactor = -scaleFactor
			}

			root.style.transition = "0.3s"
			setTimeout(function () {
				root.style.transition = "none"
			}, 300)

			let zoomOrigin = outerThis.getRelativePosition(root, { x: e.center.x, y: e.center.y }, outerThis.originalSize, outerThis.current.z)
			let d = outerThis.scaleFrom(zoomOrigin, outerThis.current.z, outerThis.current.z + scaleFactor)
			outerThis.setCurrentSafePosition(d.x, d.y, d.z)

			outerThis.last.x = outerThis.current.x
			outerThis.last.y = outerThis.current.y
			outerThis.last.z = outerThis.current.z

			outerThis.update()
		})

		// @ts-ignore
		hammer.on("pan", function (e) {
			if (outerThis.current.z <= 1) {
				return // use browser behavior //FIXME propagation
			}
			if (outerThis.lastEvent !== "pan") {
				outerThis.fixHammerjsDeltaIssue = {
					x: e.deltaX,
					y: e.deltaY,
				}
			}

			outerThis.setCurrentSafePosition(
				outerThis.last.x + e.deltaX - outerThis.fixHammerjsDeltaIssue.x,
				outerThis.last.y + e.deltaY - outerThis.fixHammerjsDeltaIssue.y,
				outerThis.current.z,
			)
			outerThis.lastEvent = "pan"
			outerThis.update()
		})

		// @ts-ignore
		hammer.on("pinch", function (e) {
			let d = outerThis.scaleFrom(outerThis.pinchZoomOrigin, outerThis.last.z, outerThis.last.z * e.scale)
			outerThis.setCurrentSafePosition(d.x + outerThis.last.x + e.deltaX, d.y + outerThis.last.y + e.deltaY, d.z + outerThis.last.z)
			outerThis.lastEvent = "pinch"
			outerThis.update()
		})

		// @ts-ignore
		hammer.on("pinchstart", function (e) {
			outerThis.pinchStart.x = e.center.x
			outerThis.pinchStart.y = e.center.y
			outerThis.pinchZoomOrigin = outerThis.getRelativePosition(
				outerThis.root,
				{
					x: outerThis.pinchStart.x,
					y: outerThis.pinchStart.y,
				},
				outerThis.originalSize,
				outerThis.current.z,
			)
			outerThis.lastEvent = "pinchstart"
		})

		// @ts-ignore
		hammer.on("panend", function (e) {
			outerThis.last.x = outerThis.current.x
			outerThis.last.y = outerThis.current.y
			outerThis.lastEvent = "panend"
		})

		// @ts-ignore
		hammer.on("pinchend", function (e) {
			outerThis.last.x = outerThis.current.x
			outerThis.last.y = outerThis.current.y
			outerThis.last.z = outerThis.current.z
			outerThis.lastEvent = "pinchend"
		})
	}

	private touchmove_handler(ev: TouchEvent) {
		// console.log(ev)
		switch (ev.touches.length) {
			case 1:
				this.dragHandling(ev)
				break
			case 2:
				this.pinchHandling(ev)
				break
			default:
				break
		}
	}

	private pinchHandling(ev: TouchEvent) {
		// Calculate the distance between the two pointers
		const curDiff = Math.sqrt(Math.pow(ev.touches[1].clientX - ev.touches[0].clientX, 2) + Math.pow(ev.touches[1].clientY - ev.touches[0].clientY, 2))
		// console.log(this.touchIDs)
		if (!(this.pinchTouchIDs.has(ev.touches[0].identifier) && this.pinchTouchIDs.has(ev.touches[1].identifier))) {
			// in case of a new touch
			this.xMiddle = (ev.touches[1].pageX + ev.touches[0].pageX) / 2 // keep initial zoom center for whole zoom operation even if fingers are moving
			this.yMiddle = (ev.touches[1].pageY + ev.touches[0].pageY) / 2
			this.prevDiff = -1
		}
		// console.log(curDiff)
		// console.log("prev" + this.prevDiff)

		if (this.prevDiff > 0) {
			const additionalFactor = 1.01
			const changeFactor = 40 * window.devicePixelRatio // should be dependent on the devices dpi?
			// this.zoom((curDiff - this.prevDiff) / changeFactor, this.xMiddle, this.yMiddle)
		}

		this.pinchTouchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

		// Cache the distance for the next move event
		this.prevDiff = curDiff
	}

	private dragHandling(ev: TouchEvent) {
		//FIXME check for new touch
		if (this.currentScale > 1) {
			// otherwise no need to drag
			ev.preventDefault()
			const newX = ev.touches[0].pageX
			const newY = ev.touches[0].pageY
			if (!this.dragTouchIDs.has(ev.touches[0].identifier)) {
				console.log("new touch")
				this.dragTouchIDs = new Set<number>([ev.touches[0].identifier])
				this.startX = newX
				this.startY = newY
				this.currentX = newX
				this.currentY = newY
			}

			// if (this.offsetX !== newX && this.offsetX !== -1) {
			// this.moveBy(newX - this.currentX, newY - this.currentY)
			// this.directMove(this.currentX - newX, this.currentY - newY)
			// }
			// if (this.offsetY !== newY && this.offsetY !== -1) {
			// 	this.moveBy(MoveDirection.Y, newY - this.currentY)
			// }
			// this.offsetX = newX
			// this.offsetY = newY
			this.currentX = newX
			this.currentY = newY
		}
	}

	private invalidBorder(): boolean {
		if (
			this.root.style.left > this.parent.style.left ||
			this.root.style.right < this.parent.style.right ||
			this.root.style.top > this.parent.style.top ||
			this.root.style.bottom < this.parent.style.bottom
		) {
			return true
		}
		return false
	}

	/**
	 *
	 * @param scale reset if no values given
	 * @private
	 */
	private saveScale(scale: number = -1) {
		console.log("change scale")
		if (scale === -1) {
			this.currentScale = -1
			this.maxScale = -1
			this.minScale = -1
		} else {
			this.currentScale = scale
			this.minScale = scale //- 0.1 // should further zooming out be possible? //FIXME
			this.maxScale = scale + 1
		}
		console.log("new scale", this.currentScale)
	}

	setInitialScale(scale: number) {
		console.log("initialize scaling", scale)
		if (this.currentScale === -1) {
			this.saveScale(scale)
		}
	}

	private removeTouches() {
		this.lastTransformOrigin.x = this.currentTransformOrigin.x
		this.lastTransformOrigin.y = this.currentTransformOrigin.y
		this.pinchTouchIDs.clear()
		this.dragTouchIDs.clear()
	}

	//// new

	private pinchZoomOrigin: { x: number; y: number } = { x: 0, y: 0 }
	private fixHammerjsDeltaIssue: { x: number; y: number } = { x: 0, y: 0 }
	private pinchStart: { x: number; y: number } = { x: 0, y: 0 }
	private lastEvent: string = ""

	private originalSize = {
		width: 200, //FIXME
		height: 300,
	}

	private current = {
		x: 0,
		y: 0,
		z: 1,
		zooming: false,
		width: this.originalSize.width * 1,
		height: this.originalSize.height * 1,
	}

	private last = {
		x: this.current.x,
		y: this.current.y,
		z: this.current.z,
	}

	private getRelativePosition(
		element: HTMLElement,
		point: { x: number; y: number },
		originalSize: { width: number; height: number },
		scale: number,
	): { x: number; y: number } {
		let domCoords = this.getCoords(element)

		let elementX = point.x - domCoords.x
		let elementY = point.y - domCoords.y

		let relativeX = elementX / ((originalSize.width * scale) / 2) - 1
		let relativeY = elementY / ((originalSize.height * scale) / 2) - 1
		return { x: relativeX, y: relativeY }
	}

	private getCoords(elem: HTMLElement) {
		// crossbrowser version
		let box = elem.getBoundingClientRect()

		let body = document.body
		let docEl = document.documentElement

		let scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop
		let scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft

		let clientTop = docEl.clientTop || body.clientTop || 0
		let clientLeft = docEl.clientLeft || body.clientLeft || 0

		let top = box.top + scrollTop - clientTop
		let left = box.left + scrollLeft - clientLeft
		let bottom = box.bottom + scrollTop - clientTop
		let right = box.right + scrollLeft - clientLeft

		return { x: Math.round(left), y: Math.round(top), x2: Math.round(right), y2: Math.round(bottom) }
	}

	private scaleFrom(zoomOrigin: { x: number; y: number }, currentScale: number, newScale: number) {
		let currentShift = this.getCoordinateShiftDueToScale(this.originalSize, currentScale)
		let newShift = this.getCoordinateShiftDueToScale(this.originalSize, newScale)

		let zoomDistance = newScale - currentScale

		let shift = {
			x: currentShift.x - newShift.x,
			y: currentShift.y - newShift.y,
		}

		let output = {
			x: zoomOrigin.x * shift.x,
			y: zoomOrigin.y * shift.y,
			z: zoomDistance,
		}
		return output
	}

	private getCoordinateShiftDueToScale(size: { width: number; height: number }, scale: number) {
		let newWidth = scale * size.width
		let newHeight = scale * size.height
		let dx = (newWidth - size.width) / 2
		let dy = (newHeight - size.height) / 2
		return {
			x: dx,
			y: dy,
		}
	}

	private update() {
		this.current.height = this.originalSize.height * this.current.z
		this.current.width = this.originalSize.width * this.current.z
		this.root.style.transform = "translate3d(" + this.current.x + "px, " + this.current.y + "px, 0) scale(" + this.current.z + ")"
	}

	/**
	 * top y should not be > initial top y
	 * bottom y should not be < initial bottom y
	 * left x should not be > initial left x
	 * right x should not be < initial right x
	 * @param newX
	 * @param newY
	 * @param newZ
	 * @private
	 */
	private setCurrentSafePosition(newX: number, newY: number, newZ: number) {
		let parentBorders = this.getCoords(this.parent)
		let rootBorders = this.getCoords(this.root)
		if (rootBorders.x + newX < parentBorders.x && rootBorders.x2 + newX > parentBorders.x2) {
			this.current.x = newX
		}
		if (rootBorders.y + newY < parentBorders.y && rootBorders.y2 + newY > parentBorders.y2) {
			this.current.y = newY
		}
		this.current.z = Math.max(1, Math.min(4, newZ)) // don't allow zooming out or zooming in more than 3x
	}
}
