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
	private initialCoords = { x: 0, y: 0, x2: 0, y2: 0 }

	constructor(private readonly root: HTMLElement, private readonly parent: HTMLElement) {
		this.initialCoords = this.getCoords(this.root) // already needs to be rendered
		this.current.x = this.initialCoords.x
		this.current.y = this.initialCoords.y
		console.log("initialcoords", this.initialCoords.x, this.initialCoords.y)
		this.originalSize = { width: Math.abs(this.initialCoords.x2 - this.initialCoords.x), height: Math.abs(this.initialCoords.y2 - this.initialCoords.y) }

		console.log("new Pinch to zoom----------------")
		// this.setInitialScale(1)
		this.root.ontouchend = (e) => {
			this.removeTouches(e)
			// console.log("touch end")
		}
		this.root.ontouchmove = (e) => {
			this.touchmove_handler(e)
			// console.log("touch move")
		}
		this.root.ontouchcancel = (e) => {
			this.removeTouches(e)
			// console.log("touch cancel")
		}

		this.root.style.touchAction = "pan-y pan-x" // makes zooming smooth
		this.root.style.transformOrigin = "center" // zooms in the right position
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

	private startPinchSession(ev: TouchEvent) {
		this.lastMultiple = {
			pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
			pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
		}

		this.pinchCenter = this.centerOfPoints({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
		this.pinchStart.x = this.pinchCenter.x
		this.pinchStart.y = this.pinchCenter.y
		this.pinchZoomOrigin = this.getRelativePosition(
			this.root,
			{
				x: this.pinchStart.x,
				y: this.pinchStart.y,
			},
			this.originalSize,
			this.current.z,
		)
		this.lastEvent = "pinchstart"
	}

	private pinchHandling(ev: TouchEvent) {
		// new pinch gesture?
		// let delta = { x: 0, y: 0 }
		if (!(this.pinchTouchIDs.has(ev.touches[0].identifier) && this.pinchTouchIDs.has(ev.touches[1].identifier))) {
			this.startPinchSession(ev)
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

		this.lastMultiple.pointer1 = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
		this.lastMultiple.pointer2 = { x: ev.touches[1].clientX, y: ev.touches[1].clientY }

		let d = this.scaleFrom(this.pinchZoomOrigin, this.last.z, this.last.z * scaling)
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

	private pinchZoomOrigin: { x: number; y: number } = { x: 0, y: 0 }
	private pinchCenter: { x: number; y: number } = { x: 0, y: 0 }
	private fixDeltaIssue: { x: number; y: number } = { x: 0, y: 0 }
	private pinchStart: { x: number; y: number } = { x: 0, y: 0 }
	private lastEvent: string = ""

	private readonly originalSize = {
		// default values will be immediately overwritten with real values
		width: 0,
		height: 0,
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

	private newScaledCoordinates(zoomPosition: CoordinatePair, newScale: number) {
		console.log("zoomPosition", zoomPosition)
		const currentNormalizedCoordinates = {
			x: this.current.x,
			y: this.current.y,
			x2: this.current.x + this.originalSize.width,
			y2: this.current.y + this.originalSize.height,
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
		console.log("middle of root", middle)

		console.log("newScale", newScale)
		console.log("offset x", (newScale - 1) * (middle.x - zoomPosition.x))

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
		console.log(`x: ${this.current.x}, y: ${this.current.y}, z: ${this.current.z}`)
		this.current.height = this.originalSize.height * this.current.z
		this.current.width = this.originalSize.width * this.current.z
		console.log("root before transform", JSON.stringify(this.getCoords(this.root)))
		this.root.style.transformOrigin = "center" // zooms in the right position
		this.root.style.transform =
			"translate3d(" + (this.current.x - this.initialCoords.x) + "px, " + (this.current.y - this.initialCoords.y) + "px, 0) scale(" + this.current.z + ")"
		console.log("root after transform", JSON.stringify(this.getCoords(this.root)))
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
		console.log(`newX: ${newPosition.x}, newy: ${newPosition.y}`)
		let parentBorders = this.getCoords(this.parent)
		const rootBorders = { x: newPosition.x, y: newPosition.y, x2: newPosition.x + this.originalSize.width, y2: newPosition.y + this.originalSize.height }

		const newMiddle: CoordinatePair = this.centerOfPoints({ x: rootBorders.x, y: rootBorders.y }, { x: rootBorders.x2, y: rootBorders.y2 })

		scaling = Math.max(1, Math.min(3, scaling)) // don't allow zooming out or zooming in more than 3x

		const scaledX1 = rootBorders.x + (scaling - 1) * (rootBorders.x - newMiddle.x)
		const scaledX2 = rootBorders.x2 + (scaling - 1) * (rootBorders.x2 - newMiddle.x)

		const scaledY1 = rootBorders.y + (scaling - 1) * (rootBorders.y - newMiddle.y)
		const scaledY2 = rootBorders.y2 + (scaling - 1) * (rootBorders.y2 - newMiddle.y)
		// const currentWidth = rootBorders.x2 - rootBorders.x
		// const currentHeight = rootBorders.y2 - rootBorders.y
		// const newWidth = Math.round(this.originalSize.width * newZ)
		// const newHeight = Math.round(this.originalSize.height * newZ)
		// const modifierX = (currentWidth - newWidth) / 2
		// const modifierY = (currentHeight - newHeight) / 2

		console.log("scaledX1", scaledX1)
		console.log("parentBorder x", parentBorders.x)
		console.log("scaledX2", scaledX2)
		console.log("parentBorder x2", parentBorders.x2)
		let xChanged = false
		let yChanged = false
		if (scaledX1 <= parentBorders.x && scaledX2 >= parentBorders.x2) {
			// also take the scaling into account
			console.log("current x", this.current.x)
			this.current.x = newPosition.x
			xChanged = true
		}
		if (scaledY1 <= parentBorders.y && scaledY2 >= parentBorders.y2) {
			this.current.y = newPosition.y
			yChanged = true
		}
		if (xChanged || yChanged) {
			this.current.z = scaling
		}
	}
}
