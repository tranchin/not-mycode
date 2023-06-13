type CoordinatePair = {
	x: number
	y: number
}

export class PinchZoomV2 {
	private dragTouchIDs: Set<number> = new Set<number>()
	private pinchTouchIDs: Set<number> = new Set<number>()
	private lastMultiple: { pointer1: CoordinatePair; pointer2: CoordinatePair } = { pointer1: { x: 0, y: 0 }, pointer2: { x: 0, y: 0 } }
	private previousDelta: CoordinatePair = { x: 0, y: 0 }
	private offsetDelta: CoordinatePair = { x: 0, y: 0 }
	private previousInput: { delta: CoordinatePair; event: string } = { delta: { x: 0, y: 0 }, event: "end" }
	private initialMailBodyCoords = { x: 0, y: 0, x2: 0, y2: 0 }

	/**
	 *
	 * @param mailBody
	 * @param viewport
	 */
	constructor(private readonly mailBody: HTMLElement, private readonly viewport: HTMLElement) {
		this.initialMailBodyCoords = this.getCoords(this.mailBody) // already needs to be rendered
		this.current.x = this.initialMailBodyCoords.x
		this.current.y = this.initialMailBodyCoords.y
		console.log("initialcoords", this.initialMailBodyCoords.x, this.initialMailBodyCoords.y)
		this.originalMailBodySize = {
			width: Math.abs(this.initialMailBodyCoords.x2 - this.initialMailBodyCoords.x),
			height: Math.abs(this.initialMailBodyCoords.y2 - this.initialMailBodyCoords.y),
		}

		console.log("new Pinch to zoom----------------")
		// this.setInitialScale(1)
		this.mailBody.ontouchend = (e) => {
			this.removeTouches(e)
			// console.log("touch end")
		}
		this.mailBody.ontouchmove = (e) => {
			this.touchmove_handler(e)
			// console.log("touch move")
		}
		this.mailBody.ontouchcancel = (e) => {
			this.removeTouches(e)
			// console.log("touch cancel")
		}

		this.mailBody.style.touchAction = "pan-y pan-x" // makes zooming smooth
		this.mailBody.style.transformOrigin = "center" // zooms in the right position
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

	private getOriginalPosition() {
		let element: HTMLElement | null = this.mailBody
		let offsetLeft = 0
		let offsetTop = 0

		do {
			offsetLeft += element.offsetLeft
			offsetTop += element.offsetTop

			element = element.offsetParent as HTMLElement
		} while (element)
		return { x: offsetLeft, y: offsetTop }
	}

	private calculateSessionTransformOrigin(currentScaling: number, newScaling: number): CoordinatePair {
		// scaling = 1
		// newScaling = 0.00001
		// console.log("computedStyle", getComputedStyle(this.mailBody).top)
		// console.log("original Position", JSON.stringify(this.getOriginalPosition())) //FIXME revert transformation with current coordinates, scale and last origin?
		return { x: this.pinchCenter.x - this.pinchSessionOffset.x, y: this.pinchCenter.y - this.pinchSessionOffset.y } //FIXME pinchSessionOffset should not include scaling which it currently does but still y-scrolling (x-scrolling?)
		let scaling = currentScaling + newScaling
		if (scaling === 1) {
			// console.log("newTransformOrigin", this.pinchCenter)
			return { x: this.pinchCenter.x - this.pinchSessionOffset.x, y: this.pinchCenter.y - this.pinchSessionOffset.y }
		}

		let currentCoords = this.getCoords(this.mailBody)
		// revert transformation
		let revertedCoords = {
			x: (currentCoords.x - this.pinchCenter.x) / currentScaling + this.pinchCenter.x,
			y: (currentCoords.y - this.pinchCenter.y) / currentScaling + this.pinchCenter.y,
		}

		// console.log("currentCoords x", currentCoords.x)
		// console.log("revertedCoords", revertedCoords)
		let targetCoords: CoordinatePair = {
			x: newScaling * (revertedCoords.x - this.pinchCenter.x) + revertedCoords.x,
			y: newScaling * (revertedCoords.y - this.pinchCenter.y) + revertedCoords.y,
		}
		// console.log("targetCoords", targetCoords)
		// console.log("scaling", scaling)
		let newTransformOrigin: CoordinatePair = {
			x: (targetCoords.x - this.pinchSessionOffset.x - scaling * this.initialMailBodyCoords.x) / (1 - scaling) - this.pinchSessionOffset.x,
			y: (targetCoords.y - this.pinchSessionOffset.y - scaling * this.initialMailBodyCoords.y) / (1 - scaling) - this.pinchSessionOffset.y,
		}
		// console.log("newTransformOrigin", newTransformOrigin)
		return newTransformOrigin
	}

	private calculateDelta(startOfInput: boolean, ...points: CoordinatePair[]): CoordinatePair {
		//FIXME
		// FIXME return value is semantically not quite accurate
		const center = this.centerOfPoints(...points)
		let offset = this.offsetDelta || {} //FIXME
		let prevDelta = this.previousDelta || {}
		let prevInput = this.previousInput || {}

		if (startOfInput || prevInput.event === "end") {
			prevDelta = this.previousDelta = {
				x: prevInput.delta.x || 0,
				y: prevInput.delta.y || 0,
			}

			offset = this.offsetDelta = {
				x: center.x,
				y: center.y,
			}
		}

		const deltaX = prevDelta.x + (center.x - offset.x)
		const deltaY = prevDelta.y + (center.y - offset.y)
		return { x: deltaX, y: deltaY }
	}

	private pointDistance(point1: CoordinatePair, point2: CoordinatePair): number {
		return Math.round(Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)))
	}

	private centerOfPoints(...points: CoordinatePair[]): CoordinatePair {
		let x = 0
		let y = 0
		for (let point of points) {
			x += point.x
			y += point.y
		}
		return { x: Math.round(x / points.length), y: Math.round(y / points.length) }
	}

	private calculateSessionsTranslation(): CoordinatePair {
		let currentRect = this.getCoords(this.mailBody)
		console.log("mail body", JSON.stringify(currentRect))

		// let scrollPosition = this.getScrollPosition(this.mailBody)
		// console.log("scroll position", JSON.stringify(scrollPosition))

		// let relativeRect = { x: currentRect.x - this.initialMailBodyCoords.x, y: currentRect.y - this.initialMailBodyCoords.y }
		let relativeRect = { x: currentRect.x - currentRect.x, y: currentRect.y - currentRect.y }
		// let relativePinchCenter = { x: this.pinchCenter.x - this.initialMailBodyCoords.x, y: this.pinchCenter.y - this.initialMailBodyCoords.y }
		//TODO do not use currentRect, but the scrolled rect here
		let relativePinchCenter = { x: this.pinchCenter.x - currentRect.x, y: this.pinchCenter.y - currentRect.y }
		console.log("relativePinchCenter", JSON.stringify(relativePinchCenter))
		let sessionTranslation = {
			x: relativePinchCenter.x - (relativePinchCenter.x - relativeRect.x) / this.current.z,
			y: relativePinchCenter.y - (relativePinchCenter.y - relativeRect.y) / this.current.z,
		}
		console.log("sessionTranslation", JSON.stringify(sessionTranslation))
		return sessionTranslation
	}

	private startPinchSession(ev: TouchEvent) {
		this.lastMultiple = {
			pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
			pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
		}

		this.lastTransformOrigin = this.pinchCenter
		this.pinchCenter = this.centerOfPoints({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
		this.pinchStart.x = this.pinchCenter.x
		this.pinchStart.y = this.pinchCenter.y
		let currentCoords = this.getCoords(this.mailBody)
		this.pinchSessionOffset.x = currentCoords.x
		this.pinchSessionOffset.y = currentCoords.y
		this.pinchSessionTranslation = this.calculateSessionsTranslation()

		let currentRect = this.getCoords(this.mailBody)
		let transformOrigin = {
			// x: this.pinchCenter.x - this.initialMailBodyCoords.x,
			// y: this.pinchCenter.y - this.initialMailBodyCoords.y
			x: this.pinchCenter.x - currentRect.x, //TODO: includes scaled change of position. just use scroll position from the original size
			y: this.pinchCenter.y - currentRect.y,
		}
		console.log("transformOrigin", JSON.stringify(transformOrigin))
		this.mailBody.style.transformOrigin = `${transformOrigin.x}px ${transformOrigin.y}px` // zooms in the right position //FIXME approach 2
		// this.pinchZoomOrigin = this.getRelativePosition(
		// 	this.mailBody,
		// 	{
		// 		x: this.pinchStart.x,
		// 		y: this.pinchStart.y,
		// 	},
		// 	this.originalMailBodySize,
		// 	this.current.z,
		// )
		this.lastEvent = "pinchstart"
	}

	private pinchHandling(ev: TouchEvent) {
		// new pinch gesture?
		// let delta = { x: 0, y: 0 }
		let newSession = false
		if (!(this.pinchTouchIDs.has(ev.touches[0].identifier) && this.pinchTouchIDs.has(ev.touches[1].identifier))) {
			this.startPinchSession(ev)
			newSession = true
			// delta = this.calculateDelta(true, { x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
			// this.previousInput = { delta: { x: delta.x, y: delta.y }, event: "start" }
		} else {
			// delta = this.calculateDelta(false, { x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
			// this.previousInput = { delta: { x: delta.x, y: delta.y }, event: "move" }
		}

		//update current touches
		this.pinchTouchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

		// Calculate the scaling (1 = no scaling, 0 = maximum pinched in, >1 pinching out
		const scaling =
			this.pointDistance({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY }) /
			this.pointDistance(this.lastMultiple.pointer1, this.lastMultiple.pointer2)

		this.sessionTransformOrigin = newSession ? this.calculateSessionTransformOrigin(this.current.z, scaling - 1) : this.sessionTransformOrigin

		this.lastMultiple.pointer1 = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
		this.lastMultiple.pointer2 = { x: ev.touches[1].clientX, y: ev.touches[1].clientY }

		// let d = this.scaleFrom(this.pinchZoomOrigin, this.last.z, this.last.z * scaling)
		let d2 = this.newScaledCoordinates(this.pinchCenter, scaling)
		// this.setCurrentSafePosition(d.x + this.pinchZoomOrigin.x /* + this.last.x*/, d.y + this.pinchZoomOrigin.y /* + this.last.y*/, d.z + this.last.z) //FIXME
		this.setCurrentSafePosition(d2, this.current.z + (scaling - 1)) //FIXME // scaling prob. wrong
		this.lastEvent = "pinch"
		this.update()
	}

	private dragHandling(ev: TouchEvent) {
		//FIXME check for new touch
		if (this.current.z > 1) {
			ev.stopPropagation() // maybe not if is not movable FIXME

			let delta = { x: 0, y: 0 }
			if (!this.dragTouchIDs.has(ev.touches[0].identifier)) {
				// new dragging
				this.dragTouchIDs = new Set<number>([ev.touches[0].identifier])
				delta = this.calculateDelta(true, { x: ev.touches[0].clientX, y: ev.touches[0].clientY }) //FIXME I think delta also needs to be changed if the surrounding is scrolled/ changed
			} else {
				// still same dragging
				delta = this.calculateDelta(false, { x: ev.touches[0].clientX, y: ev.touches[0].clientY })
			}

			if (this.lastEvent !== "pan") {
				this.fixDeltaIssue = {
					x: delta.x,
					y: delta.y,
				}
			}

			// this.setCurrentSafePosition({x: this.last.x + delta.x - this.fixDeltaIssue.x, y: this.last.y + delta.y - this.fixDeltaIssue.y}, this.current.z) //FIXME
			this.current.x = this.last.x + delta.x - this.fixDeltaIssue.x
			this.current.y = this.last.y + delta.y - this.fixDeltaIssue.y
			this.lastEvent = "pan"
			this.update()
		}
	}

	private removeTouches(ev: TouchEvent) {
		this.previousInput.event = "end"
		if (ev.touches.length > 0) {
			this.last.x = this.current.x
			this.last.y = this.current.y
			this.last.z = this.current.z
			this.lastEvent = "pinchend"
			this.pinchTouchIDs.clear()
		} else {
			this.last.x = this.current.x
			this.last.y = this.current.y
			this.lastEvent = "panend"
			this.dragTouchIDs.clear()
		}
	}

	//// new

	// private pinchZoomOrigin: { x: number; y: number } = { x: 0, y: 0 }
	private pinchCenter: { x: number; y: number } = { x: 0, y: 0 }
	private fixDeltaIssue: { x: number; y: number } = { x: 0, y: 0 }
	private pinchStart: { x: number; y: number } = { x: 0, y: 0 }
	private pinchSessionOffset: CoordinatePair = { x: 0, y: 0 }
	private sessionTransformOrigin: CoordinatePair = { x: 0, y: 0 }
	private pinchSessionTranslation: CoordinatePair = { x: 0, y: 0 }
	private lastEvent: string = ""

	private readonly originalMailBodySize = {
		// default values will be immediately overwritten with real values
		width: 0,
		height: 0,
	}

	private current = {
		x: 0,
		y: 0,
		z: 1,
		zooming: false,
		width: this.originalMailBodySize.width * 1,
		height: this.originalMailBodySize.height * 1,
	}

	private last = {
		x: this.current.x,
		y: this.current.y,
		z: this.current.z,
	}

	private lastTransformOrigin = {
		x: 0,
		y: 0,
	}

	private getRelativePosition(
		//FIXME what does that do?
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
		let currentShift = this.getCoordinateShiftDueToScale(this.originalMailBodySize, currentScale)
		let newShift = this.getCoordinateShiftDueToScale(this.originalMailBodySize, newScale)

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

	private newScaledCoordinates(zoomPosition: CoordinatePair, newScale: number) {
		// console.log("zoomPosition", zoomPosition)
		const currentNormalizedCoordinates = {
			x: this.current.x,
			y: this.current.y,
			x2: this.current.x + this.originalMailBodySize.width,
			y2: this.current.y + this.originalMailBodySize.height,
		} // current coordinates without scaling
		// zoomPosition = { x: zoomPosition.x - currentCoordinates.x, y: zoomPosition.y - currentCoordinates.y } // shift in case that display was scrolled
		// console.log("corrected position", zoomPosition)
		const newCoordinates = this.scaleAndShift(zoomPosition, newScale, currentNormalizedCoordinates)

		return { x: currentNormalizedCoordinates.x + newCoordinates.xOffset, y: currentNormalizedCoordinates.y + newCoordinates.yOffset }
	}

	// returns the offset to the current points
	private scaleAndShift(zoomPosition: CoordinatePair, newScale: number, currentCoordinates: { x: number; y: number; x2: number; y2: number }) {
		const middle: CoordinatePair = this.centerOfPoints(
			{ x: currentCoordinates.x, y: currentCoordinates.y },
			{ x: currentCoordinates.x2, y: currentCoordinates.y2 },
		)
		// console.log("middle of mailBody", middle)

		// console.log("newScale", newScale)
		// console.log("offset x", (newScale - 1) * (middle.x - zoomPosition.x))

		return {
			xOffset: Math.round((newScale - 1) * (middle.x - zoomPosition.x)),
			yOffset: Math.round((newScale - 1) * (middle.y - zoomPosition.y)),
		}

		// return {
		// 	ax: (newScale - 1) * (middle.x - zoomPosition.x), // topleft corner
		// 	ay: (newScale - 1) * (middle.y - zoomPosition.x),
		// 	bx: (newScale - 1) * (middle.x - zoomPosition.x), // bottomleft corner
		// 	by: (newScale - 1) * (middle.x - zoomPosition.x),
		// 	cx: (newScale - 1) * (middle.x - zoomPosition.x), // bottomright corner
		// 	cy: (newScale - 1) * (middle.x - zoomPosition.x),
		// 	dx: (newScale - 1) * (middle.x - zoomPosition.x), // topright corner
		// 	dy: (newScale - 1) * (middle.x - zoomPosition.x),
		// }
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
		// console.log(`x: ${this.current.x}, y: ${this.current.y}, z: ${this.current.z}`)

		// TODO: removed. do we need this?
		// this.current.height = this.originalMailBodySize.height * this.current.z
		// this.current.width = this.originalMailBodySize.width * this.current.z

		// console.log("mailBody before transform", JSON.stringify(this.getCoords(this.mailBody)))
		// const currentCoordinates = this.getCoords(this.mailBody)
		// this.mailBody.style.transformOrigin = `${this.sessionTransformOrigin.x}px ${this.sessionTransformOrigin.y}px` // zooms in the right position //FIXME approach 1

		// this.mailBody.style.transform =
		// 	"translate3d(" + (this.current.x - this.initialMailBodyCoords.x) + "px, " + (this.current.y - this.initialMailBodyCoords.y) + "px, 0) scale(" + this.current.z + ")"
		//this.mailBody.style.transform = `translate3d(${0}px, ${0}px, 0) scale(${this.current.z})` //FIXME approach 1
		this.mailBody.style.transform = `translate3d(${this.pinchSessionTranslation.x}px, ${this.pinchSessionTranslation.y}px, 0) scale(${this.current.z})` //FIXME approach 2
		// console.log("mailBody after transform", JSON.stringify(this.getCoords(this.mailBody)))
	}

	/**
	 * top y should not be > initial top y
	 * bottom y should not be < initial bottom y
	 * left x should not be > initial left x
	 * right x should not be < initial right x
	 * @param newX
	 * @param newY
	 * @param scaling
	 * @private
	 */
	private setCurrentSafePosition(newPosition: CoordinatePair, scaling: number) {
		// console.log(`newX: ${newPosition.x}, newy: ${newPosition.y}`)
		let parentBorders = this.getCoords(this.viewport)
		const rootBorders = {
			x: newPosition.x,
			y: newPosition.y,
			x2: newPosition.x + this.originalMailBodySize.width,
			y2: newPosition.y + this.originalMailBodySize.height,
		}

		const newMiddle: CoordinatePair = this.centerOfPoints({ x: rootBorders.x, y: rootBorders.y }, { x: rootBorders.x2, y: rootBorders.y2 })

		scaling = Math.max(1, Math.min(3, scaling)) // don't allow zooming out or zooming in more than 3x

		const scaledX1 = rootBorders.x + (scaling - 1) * (rootBorders.x - newMiddle.x)
		const scaledX2 = rootBorders.x2 + (scaling - 1) * (rootBorders.x2 - newMiddle.x)

		const scaledY1 = rootBorders.y + (scaling - 1) * (rootBorders.y - newMiddle.y)
		const scaledY2 = rootBorders.y2 + (scaling - 1) * (rootBorders.y2 - newMiddle.y)
		// const currentWidth = rootBorders.x2 - rootBorders.x
		// const currentHeight = rootBorders.y2 - rootBorders.y
		// const newWidth = Math.round(this.originalMailBodySize.width * newZ)
		// const newHeight = Math.round(this.originalMailBodySize.height * newZ)
		// const modifierX = (currentWidth - newWidth) / 2
		// const modifierY = (currentHeight - newHeight) / 2

		// console.log("scaledX1", scaledX1)
		// console.log("parentBorder x", parentBorders.x)
		// console.log("scaledX2", scaledX2)
		// console.log("parentBorder x2", parentBorders.x2)
		let xChanged = false
		let yChanged = false
		if (true || (scaledX1 <= parentBorders.x && scaledX2 >= parentBorders.x2)) {
			//FIXME remove
			// console.log("current x", this.current.x)
			this.current.x = newPosition.x
			xChanged = true
		}
		if (true || (scaledY1 <= parentBorders.y && scaledY2 >= parentBorders.y2)) {
			this.current.y = newPosition.y
			yChanged = true
		}
		if (xChanged || yChanged) {
			this.current.z = scaling
		}
	}
}
