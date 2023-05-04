type CoordinatePair = {
	x: number
	y: number
}

export class PinchZoomV2 {
	private dragTouchIDs: Set<number> = new Set<number>()
	private pinchTouchIDs: Set<number> = new Set<number>()
	private firstMultiple: { pointer1: CoordinatePair; pointer2: CoordinatePair } = { pointer1: { x: 0, y: 0 }, pointer2: { x: 0, y: 0 } }
	private previousDelta: CoordinatePair = { x: 0, y: 0 }
	private offsetDelta: CoordinatePair = { x: 0, y: 0 }
	private previousInput: { delta: CoordinatePair; event: string } = { delta: { x: 0, y: 0 }, event: "end" }

	constructor(private readonly root: HTMLElement, private readonly parent: HTMLElement) {
		const initialCoords = this.getCoords(this.root) // already needs to be rendered
		this.originalSize = { width: Math.abs(initialCoords.x2 - initialCoords.x), height: Math.abs(initialCoords.y2 - initialCoords.y) }

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
		return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
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
		this.firstMultiple = {
			pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
			pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
		}

		const pinchCenter = this.centerOfPoints({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })
		this.pinchStart.x = pinchCenter.x
		this.pinchStart.y = pinchCenter.y
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
			this.pointDistance(
				{ x: ev.touches[0].clientX, y: ev.touches[0].clientY },
				{
					x: ev.touches[1].clientX,
					y: ev.touches[1].clientY,
				},
			) / this.pointDistance(this.firstMultiple.pointer1, this.firstMultiple.pointer2)

		let d = this.scaleFrom(this.pinchZoomOrigin, this.last.z, this.last.z * scaling)
		this.setCurrentSafePosition(d.x + this.pinchZoomOrigin.x /* + this.last.x*/, d.y + this.pinchZoomOrigin.y /* + this.last.y*/, d.z + this.last.z) //FIXME
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

			this.setCurrentSafePosition(this.last.x + delta.x - this.fixDeltaIssue.x, this.last.y + delta.y - this.fixDeltaIssue.y, this.current.z)
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
		console.log(`x: ${this.current.x}, y: ${this.current.y}`)
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
		console.log(`newX: ${newX}, newY: ${newY}`)
		let parentBorders = this.getCoords(this.parent)
		let rootBorders = this.getCoords(this.root)

		const currentWidth = rootBorders.x2 - rootBorders.x
		const currentHeight = rootBorders.y2 - rootBorders.y
		const newWidth = Math.round(this.originalSize.width * newZ)
		const newHeight = Math.round(this.originalSize.height * newZ)
		const modifierX = (currentWidth - newWidth) / 2
		const modifierY = (currentHeight - newHeight) / 2

		if (rootBorders.x + newX + modifierX < parentBorders.x && rootBorders.x2 + newX > parentBorders.x2) {
			// also take the scaling into account
			this.current.x = newX
		}
		if (rootBorders.y + newY + modifierY < parentBorders.y && rootBorders.y2 + newY + modifierY > parentBorders.y2) {
			this.current.y = newY
		}

		this.current.z = Math.max(1, Math.min(4, newZ)) // don't allow zooming out or zooming in more than 3x
	}
}
