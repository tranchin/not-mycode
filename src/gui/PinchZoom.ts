type CoordinatePair = {
	x: number
	y: number
}

/**
 * This class handles pinch of a given HTMLElement (zoomable) inside another HTMLElement (viewport). If that zoomable HTMLElement is zoomed in it is possible to drag it (with a new finger gesture)
 * up to the viewport borders.
 * This class also supports:
 * * Initially zooming out to match the viewport width
 * * Double tap to zoom in or out to the original zoom or to TODO
 *
 * Not supported:
 * * Dragging while pinch zooming
 * * Resizing of the zoomable HTMLElement. If the size changes it is required to create a new PinchZoom object.
 *
 * TODO
 * * Test on iOS?
 * * Cleanup code
 * * Documentation / comments
 * * Squash and rebase
 * * Test notes
 */
export class PinchZoom {
	/// listener
	private readonly onTouchEndListener: EventListener | null = null
	private readonly onTouchStartListener: EventListener | null = null
	private readonly onTouchCancelListener: EventListener | null = null
	private readonly onTouchMoveListener: EventListener | null = null

	private touchIDs: Set<number> = new Set<number>() //is used by pinch and drag separately
	private EPSILON = 0.01

	/// zooming
	private lastPinchTouchPositions: { pointer1: CoordinatePair; pointer2: CoordinatePair } = { pointer1: { x: 0, y: 0 }, pointer2: { x: 0, y: 0 } }
	private initialZoomablePosition = { x: 0, y: 0 }
	private initialViewportPosition = { x: 0, y: 0 }
	private pinchSessionTranslation: CoordinatePair = { x: 0, y: 0 }
	private initialZoomableSize = { width: 0, height: 0 }
	private zoomBoundaries = { min: 1, max: 3 }
	// values of this variable should only be the result of the calculateSafeScaleValue function (except from the initial value the value must never be 1 due to division by 1-scale). Never set values directly!
	private currentScale = 1

	/// dragging
	private lastDragTouchPosition: CoordinatePair = { x: 0, y: 0 }

	/// double tap
	// Two consecutive taps are recognized as double tap if they occur within this time span
	private DOUBLE_TAP_TIME_MS = 350
	// the radius in which we recognize a second tap or single click (and not drag)
	private SAME_POSITION_RADIUS = 40
	private touchStart: {
		x: number
		y: number
	} = { x: 0, y: 0 }
	private lastTouchStart: {
		x: number
		y: number
	} = { x: 0, y: 0 }
	private firstTapTime = 0

	/**
	 * Creates a PinchZoom object and immediately starts recognizing and reacting to zoom, drag and tab gestures.
	 * @precondition zoomable.x <= viewport.x && zoomable.y <= viewport.y && zoomable.x2 >= viewport.x2 && zoomable.y2 >= viewport.y2
	 * @precondition zoomable must have been rendered already at least once.
	 * @param zoomable The HTMLElement that shall be zoomed inside the viewport.
	 * @param viewport The HTMLElement in which the zoomable is zoomed and dragged.
	 * @param initiallyZoomToViewportWidth If true and the width of the zoomable is bigger than the viewport width, the zoomable is zoomed out to match the viewport __width__ and not the height!
	 * @param singleClickAction This function is called whenever a single click on the zoomable is detected, e.g. on a link. Since the PinchZoom class prevents all default actions these clicks need to be handled outside of this class.
	 */
	constructor(
		private readonly zoomable: HTMLElement,
		private readonly viewport: HTMLElement,
		private readonly initiallyZoomToViewportWidth: boolean,
		private readonly singleClickAction: (e: Event, target: EventTarget | null) => void,
	) {
		console.log("create pinch zoom------------------------")
		const initialZoomableCoords = this.getCoords(this.zoomable) // already needs to be rendered
		// the content of the zoomable rect can be bigger than the rect itself due to overflow
		this.initialZoomableSize = {
			width: this.zoomable.scrollWidth,
			height: this.zoomable.scrollHeight,
		}
		this.initialZoomablePosition = { x: initialZoomableCoords.x, y: initialZoomableCoords.y }

		const initialViewportCoords = this.getCoords(this.viewport)
		this.initialViewportPosition = { x: initialViewportCoords.x, y: initialViewportCoords.y }

		// for the double tap
		this.onTouchEndListener = this.zoomable.ontouchend = (e) => {
			this.removeTouches(e)
			const eventTarget = e.target // it is necessary to save the target because otherwise it changes and is not accurate anymore after the bubbling phase
			//FIXME remove listeners when removed from dom? -> ask willow or nils
			if (e.touches.length === 0 && e.changedTouches.length === 1) {
				this.handleDoubleTap(
					e,
					eventTarget,
					(e, target) => singleClickAction(e, target),
					(e) => {
						let scale = 1
						if (this.currentScale > this.zoomBoundaries.min + this.EPSILON) {
							scale = this.zoomBoundaries.min // zoom out
						} else {
							scale = (this.zoomBoundaries.min + this.zoomBoundaries.max) / 2 // FIXME what would be reasonable? // zoom in -> try out what looks the best
						}
						console.log("clientY", e.changedTouches[0].clientY)
						const translationAndOrigin = this.calculateSessionsTranslationAndTransformOrigin({
							x: e.changedTouches[0].clientX,
							y: e.changedTouches[0].clientY,
						})

						const newTransformOrigin = this.setCurrentSafePosition(
							translationAndOrigin.newTransformOrigin,
							translationAndOrigin.sessionTranslation,
							this.getCurrentZoomablePositionWithoutTransformation(),
							scale,
						).newTransformOrigin
						this.update(newTransformOrigin)
					},
				)
			}
		}
		this.onTouchStartListener = this.zoomable.ontouchstart = (e) => {
			const touch = e.touches[0]
			this.touchStart = { x: touch.clientX, y: touch.clientY }
		}
		this.onTouchMoveListener = this.zoomable.ontouchmove = (e) => {
			this.touchmove_handler(e)
		}
		this.onTouchCancelListener = this.zoomable.ontouchcancel = (e) => {
			this.removeTouches(e)
		}

		this.zoomable.style.touchAction = "pan-y pan-x" // makes zooming smooth
		this.viewport.style.overflow = "hidden" // disable default scroll behavior

		if (this.initiallyZoomToViewportWidth) {
			this.rescale()
		}
	}

	/**
	 * call this method before throwing away the reference to the pinch zoom object //FIXME write also on the class documentation
	 */
	remove() {
		if (this.onTouchEndListener) {
			this.zoomable.removeEventListener("ontouchend", this.onTouchEndListener)
		}
		if (this.onTouchStartListener) {
			this.zoomable.removeEventListener("ontouchstart", this.onTouchStartListener)
		}
		if (this.onTouchCancelListener) {
			this.zoomable.removeEventListener("ontouchcancel", this.onTouchCancelListener)
		}
		if (this.onTouchMoveListener) {
			this.zoomable.removeEventListener("ontouchmove", this.onTouchMoveListener)
		}
	}

	private touchmove_handler(ev: TouchEvent) {
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

	private removeTouches(ev: TouchEvent) {
		this.touchIDs.clear()
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

	/**
	 * returns the absolute coordinates of the rendered object (includes CSS transformations)
	 */
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

		// return { x: Math.round(left), y: Math.round(top), x2: Math.round(right), y2: Math.round(bottom) }
		return { x: left, y: top, x2: right, y2: bottom }
	}

	private getCurrentlyAppliedTransformOriginOfZoomable(): CoordinatePair {
		const computedStyle = getComputedStyle(this.zoomable)
		let transformOrigin = computedStyle.transformOrigin

		let numberPattern = /-?\d+\.?\d*/g
		let transformOriginValues = transformOrigin.match(numberPattern) //relative
		if (transformOriginValues) {
			return { x: Number(transformOriginValues[0]), y: Number(transformOriginValues[1]) }
		}
		return { x: 0, y: 0 }
	}

	/**
	 * Returns the current position of the original (without CSS transformation) zoomable
	 * the transformOrigin is relative to this point
	 */
	private getCurrentZoomablePositionWithoutTransformation() {
		let currentScrollOffset = this.getOffsetFromInitialToCurrentViewportPosition()
		return {
			x: this.initialZoomablePosition.x - currentScrollOffset.x,
			y: this.initialZoomablePosition.y - currentScrollOffset.y,
		}
	}

	/**
	 * Returns the current offset of the viewport compared to the original position. E.g. if the viewport was scrolled this scroll offset is returned.
	 **/
	private getOffsetFromInitialToCurrentViewportPosition() {
		let currentViewport = this.getCoords(this.viewport)
		return {
			x: this.initialViewportPosition.x - currentViewport.x,
			y: this.initialViewportPosition.y - currentViewport.y,
		}
	}

	/// zooming

	/**
	 * Scales the zoomable to match the viewport width if the zoomable width is bigger.
	 */
	private rescale() {
		const containerWidth = this.viewport.offsetWidth

		if (containerWidth > this.zoomable.scrollWidth) {
			this.zoomable.style.transform = ""
			this.zoomable.style.marginBottom = ""
		} else {
			// zoom out to match the size
			const width = this.zoomable.scrollWidth
			const scale = containerWidth / width

			this.viewport.style.height = `${this.viewport.scrollHeight * scale}px`

			this.zoomBoundaries = { min: scale, max: this.zoomBoundaries.max } // allow value <1 for minimum scale
			const newTransformOrigin = this.setCurrentSafePosition(
				{ x: 0, y: 0 },
				{
					x: 0,
					y: 0,
				},
				this.getCurrentZoomablePositionWithoutTransformation(),
				scale,
			).newTransformOrigin
			this.update(newTransformOrigin)
		}
	}

	/**
	 * Dependent on the new position of the fingers the sessionTranslation is calculated so that the transformOrigin is in the center of the touch points //FIXME improve comment
	 * The session translation is the offset by which the original/initial zoomable is moved inside the viewport in a non-scaled state, so that when scaling to the current scale factor (this.currentScale) at the
	 * calculated transform origin we get the current position and size of the zoomable inside the viewport.
	 * The transform origin is the position relative to the original/initial zoomable position (non-scaled) at which we need to zoom in so that we get the current  position and size of the zoomable inside the viewport (with applied session translation).
	 * @param absoluteZoomPosition The position in which the user wants to zoom, i.e. the center between the two fingers. This position is relative to the screen coordinates.
	 */
	private calculateSessionsTranslationAndTransformOrigin(absoluteZoomPosition: CoordinatePair): {
		sessionTranslation: CoordinatePair
		newTransformOrigin: CoordinatePair
	} {
		let currentZoomable = this.getCoords(this.zoomable)
		let scrollOffset = this.getOffsetFromInitialToCurrentViewportPosition()

		//FIXME explain?
		let transformedInitialZoomable = {
			x: (currentZoomable.x + absoluteZoomPosition.x * (this.currentScale - 1)) / this.currentScale,
			y: (currentZoomable.y + absoluteZoomPosition.y * (this.currentScale - 1)) / this.currentScale,
		}
		// if (Math.abs(this.currentScale - 1) < this.EPSILON) { //FIXME use epsilon?
		// 	transformedInitialZoomable = {
		// 		x: currentZoomable.x,
		// 		y: currentZoomable.y
		// 	}
		// }

		// the vector to get to the desired new position
		let sessionTranslation = {
			x: transformedInitialZoomable.x - this.initialZoomablePosition.x + scrollOffset.x,
			y: transformedInitialZoomable.y - this.initialZoomablePosition.y + scrollOffset.y,
		}

		// transform origin
		let transformOrigin = {
			// is relative to the new transformed zoomable
			x: absoluteZoomPosition.x - transformedInitialZoomable.x,
			y: absoluteZoomPosition.y - transformedInitialZoomable.y,
		}

		return { sessionTranslation: sessionTranslation, newTransformOrigin: transformOrigin }
	}

	/**
	 * Calculate the transform origin that is needed to the desired targetCoordinates of the zoomable, given the session translation, the targetCoordinates and the scale
	 */
	private calculateTransformOriginFromTarget(
		targetCoordinates: CoordinatePair,
		currentZoomablePositionWithoutTransformation: CoordinatePair,
		sessionTranslation: CoordinatePair,
		scale: number,
	): CoordinatePair {
		// if (Math.abs(scale - 1) === 0) {
		// 	console.log("origin from target 0")
		// 	return {
		// 		//FIXME this is wrong
		// 		x: 0, // scale is never 1 since it only should be changed by using method
		// 		y: 0,
		// 	}
		// }
		return {
			x: (currentZoomablePositionWithoutTransformation.x + sessionTranslation.x - targetCoordinates.x) / (scale - 1), // scale is never 1 since it only should be changed by using method
			y: (currentZoomablePositionWithoutTransformation.y + sessionTranslation.y - targetCoordinates.y) / (scale - 1),
		}
	}

	private startPinchSession(ev: TouchEvent) {
		console.log("pinch session started")
		const pinchCenter = this.centerOfPoints({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY })

		let translationAndOrigin = this.calculateSessionsTranslationAndTransformOrigin(pinchCenter)
		this.getCoords(this.zoomable)

		return translationAndOrigin
	}

	private pinchHandling(ev: TouchEvent) {
		// new pinch gesture?
		let transformOrigin = this.getCurrentlyAppliedTransformOriginOfZoomable()
		let pinchSessionTranslation = this.pinchSessionTranslation

		const newTouches = !(this.touchIDs.has(ev.touches[0].identifier) && this.touchIDs.has(ev.touches[1].identifier))

		if (newTouches) {
			this.lastPinchTouchPositions = {
				pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
				pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
			}
		}

		// Calculate the scaleDifference (1 = no scaleDifference, 0 = maximum pinched in, <1 pinching in -> zoom out, >1 pinching out -> zoom in
		const scaleDifference =
			this.pointDistance({ x: ev.touches[0].clientX, y: ev.touches[0].clientY }, { x: ev.touches[1].clientX, y: ev.touches[1].clientY }) /
			this.pointDistance(this.lastPinchTouchPositions.pointer1, this.lastPinchTouchPositions.pointer2)
		const newAbsoluteScale = this.currentScale + (scaleDifference - 1)

		this.lastPinchTouchPositions = {
			pointer1: { x: ev.touches[0].clientX, y: ev.touches[0].clientY },
			pointer2: { x: ev.touches[1].clientX, y: ev.touches[1].clientY },
		}

		if (newTouches || (this.currentScale >= 1 && newAbsoluteScale < 1) || (this.currentScale < 1 && newAbsoluteScale >= 1)) {
			// also start a new session if scale factor passes 1 because we need a new sessionTranslation
			const startedPinchSession = this.startPinchSession(ev)
			transformOrigin = startedPinchSession.newTransformOrigin
			pinchSessionTranslation = startedPinchSession.sessionTranslation
		}
		//update current touches
		this.touchIDs = new Set<number>([ev.touches[0].identifier, ev.touches[1].identifier])

		const newTransformOrigin = this.setCurrentSafePosition(
			transformOrigin,
			pinchSessionTranslation,
			this.getCurrentZoomablePositionWithoutTransformation(),
			newAbsoluteScale,
		).newTransformOrigin
		this.update(newTransformOrigin)
	}

	/// dragging

	private dragHandling(ev: TouchEvent) {
		if (this.currentScale > this.zoomBoundaries.min) {
			// FIXME epsilon?
			// zoomed in, otherwise there is no need for custom dragging
			// ev.stopPropagation() // maybe not if is not movable FIXME -> IOS?
			// ev.preventDefault()

			let delta = { x: 0, y: 0 }
			if (!this.touchIDs.has(ev.touches[0].identifier)) {
				// new dragging
				delta = { x: 0, y: 0 }
			} else {
				// still same dragging
				delta = { x: ev.touches[0].clientX - this.lastDragTouchPosition.x, y: ev.touches[0].clientY - this.lastDragTouchPosition.y }
			}
			this.touchIDs = new Set<number>([ev.touches[0].identifier])
			this.lastDragTouchPosition = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
			let currentRect = this.getCoords(this.zoomable)
			let currentOriginalRect = this.getCurrentZoomablePositionWithoutTransformation()
			//FIXME explain?
			let newTransformOrigin = {
				x: (currentRect.x + delta.x - (currentOriginalRect.x + this.pinchSessionTranslation.x)) / (1 - this.currentScale), // zoom is never 1
				y: (currentRect.y + delta.y - (currentOriginalRect.y + this.pinchSessionTranslation.y)) / (1 - this.currentScale),
			}
			if (Math.abs(this.currentScale - 1) < this.EPSILON) {
				console.log("dragging 0")
				newTransformOrigin = {
					x: 0,
					y: 0, //FIXME remove?
				}
			}

			let result = this.setCurrentSafePosition(
				newTransformOrigin,
				this.pinchSessionTranslation,
				this.getCurrentZoomablePositionWithoutTransformation(),
				this.currentScale,
			)
			if (!ev.cancelable) {
				console.log("event is cancelable", ev.cancelable, result.verticalTransformationAllowed)
			}
			if (ev.cancelable && result.verticalTransformationAllowed) {
				//FIXME different vertical handling -> write doc
				// console.log("preventdefault")
				// ev.stopPropagation()
				ev.preventDefault() // should prevent the default behavior of the parent elements (e.g. scrolling)
			}

			this.update(result.newTransformOrigin)
		}
	}

	private handleDoubleTap(
		event: TouchEvent,
		target: EventTarget | null,
		singleClickAction: (e: TouchEvent, target: EventTarget | null) => void,
		doubleClickAction: (e: TouchEvent) => void,
	) {
		const now = Date.now()
		const touch = event.changedTouches[0]

		// If there are no touches or it's not cancellable event (e.g. scroll)
		if (!touch || !event.cancelable) {
			return
		}

		event.preventDefault()

		if (
			now - this.firstTapTime < this.DOUBLE_TAP_TIME_MS &&
			Math.abs(touch.clientX - this.lastTouchStart.x) < this.SAME_POSITION_RADIUS && // make sure that the double tap stays within the right radius
			Math.abs(touch.clientY - this.lastTouchStart.y) < this.SAME_POSITION_RADIUS
		) {
			this.firstTapTime = 0
			doubleClickAction(event)
		} else {
			setTimeout(() => {
				if (
					this.firstTapTime === now && // same touch, if a second tap was performed this condition is false
					Math.abs(touch.clientX - this.touchStart.x) < this.SAME_POSITION_RADIUS && // otherwise single fast drag is recognized as a click
					Math.abs(touch.clientY - this.touchStart.y) < this.SAME_POSITION_RADIUS
				) {
					// at this point we are sure that there is no second tap for a double tap
					singleClickAction(event, target)
				}
			}, this.DOUBLE_TAP_TIME_MS)
		}
		this.lastTouchStart = this.touchStart
		this.firstTapTime = now
	}

	/**
	 * Applies the current session translation and scale to the zoomable, so it becomes visible.
	 */
	private update(newTransformOrigin: CoordinatePair) {
		// TODO maybe we should set the new transformOrigin here and not in setCurrentSafePosition -> might cause weird rendering?
		this.zoomable.style.transformOrigin = `${newTransformOrigin.x}px ${newTransformOrigin.y}px`
		this.zoomable.style.transform = `translate3d(${this.pinchSessionTranslation.x}px, ${this.pinchSessionTranslation.y}px, 0) scale(${this.currentScale})`
	}

	/**
	 * Checks whether the zoomable is still in the allowed are (viewport) after applying the transformations
	 * if not allowed -> adjust the transformOrigin to keep the transformed zoomable in an allowed state
	 * apply changes to sessionTranslation, zoom and transformOrigin
	 */
	private setCurrentSafePosition(
		newTransformOrigin: CoordinatePair,
		newPinchSessionTranslation: CoordinatePair,
		currentZoomablePositionWithoutTransformation: CoordinatePair,
		newScale: number,
	) {
		this.getOffsetFromInitialToCurrentViewportPosition()
		let currentViewport = this.getCoords(this.viewport)
		let borders = {
			x: currentViewport.x + 1, //FIXME tolerance -> try out whether still necessary - if so explain why this choice was made
			y: currentViewport.y + 1,
			x2: currentViewport.x2 - 1,
			y2: currentViewport.y2 - 1,
		}

		newScale = this.calculateSafeScaleValue(newScale)
		const targetedOutcome = this.simulateTransformation(
			currentZoomablePositionWithoutTransformation,
			this.initialZoomableSize.width,
			this.initialZoomableSize.height,
			newTransformOrigin,
			newPinchSessionTranslation,
			newScale,
		)
		const targetedHeight = targetedOutcome.y2 - targetedOutcome.y
		const targetedWidth = targetedOutcome.x2 - targetedOutcome.x

		const horizontal1Allowed = targetedOutcome.x <= borders.x
		const horizontal2Allowed = targetedOutcome.x2 >= borders.x2

		const vertical1Allowed = targetedOutcome.y <= borders.y
		const vertical2Allowed = targetedOutcome.y2 >= borders.y2

		const horizontalTransformationAllowed = horizontal1Allowed && horizontal2Allowed
		const verticalTransformationAllowed = vertical1Allowed && vertical2Allowed

		// find out which operation would be illegal and calculate the adjusted transformOrigin
		const targetX = !horizontal1Allowed ? borders.x : !horizontal2Allowed ? borders.x2 - targetedWidth : targetedOutcome.x
		const targetY = !vertical1Allowed ? borders.y : !vertical2Allowed ? borders.y2 - targetedHeight : targetedOutcome.y
		if (targetX !== targetedOutcome.x || targetY !== targetedOutcome.y) {
			newTransformOrigin = this.calculateTransformOriginFromTarget(
				{
					x: targetX,
					y: targetY,
				},
				currentZoomablePositionWithoutTransformation,
				newPinchSessionTranslation,
				newScale,
			)
			console.log("transform origin", JSON.stringify(newTransformOrigin))
		}
		this.pinchSessionTranslation = newPinchSessionTranslation
		this.currentScale = newScale
		// if (newScale <= this.zoomBoundaries.min + this.EPSILON) { // FIXME what should we do?
		// 	this.currentScale = this.zoomBoundaries.min
		// 	adjustedTransformOrigin = { x: 0, y: 0 }
		// }

		return {
			verticalTransformationAllowed,
			horizontalTransformationAllowed,
			newTransformOrigin,
		}
	}

	/**
	 * prevent the scale value from being too close to 1 due to numerical instability and division by 0
	 */
	private calculateSafeScaleValue(unsafeNewScale: number): number {
		let newScale = Math.max(this.zoomBoundaries.min, Math.min(this.zoomBoundaries.max, unsafeNewScale)) // keep the zooming factor within the defined boundaries
		// if (Math.abs(newScale - 1) < this.EPSILON) {
		// 	// numerical unstable or division by 0
		// 	if (this.zoomBoundaries.min === 1) {
		// 		// zoomable that is _not_ zoomed out initially
		// 		newScale = 1 + this.EPSILON
		// 	} else if (this.zoomBoundaries.min < 1) {
		// 		// zoomable that is zoomed out initially
		// 		// try to guess the zoom direction
		// 		if (this.currentScale < newScale) {
		// 			// zooming in
		// 			newScale = 1 + this.EPSILON
		// 		} else if (this.currentScale > newScale) {
		// 			// zooming out
		// 			newScale = 1 - this.EPSILON
		// 		}
		// 	}
		// }
		return newScale
	}

	/**
	 * calculate the outcome of the css transformation
	 * this is used to check the boundaries before actually applying the transformation
	 */
	private simulateTransformation(
		currentOriginalPosition: CoordinatePair,
		originalWidth: number,
		originalHeight: number,
		transformOrigin: CoordinatePair,
		translation: CoordinatePair,
		scale: number,
	): { x: number; y: number; x2: number; y2: number } {
		return {
			x: currentOriginalPosition.x + transformOrigin.x - transformOrigin.x * scale + translation.x,
			y: currentOriginalPosition.y + transformOrigin.y - transformOrigin.y * scale + translation.y,
			x2: currentOriginalPosition.x + transformOrigin.x + (originalWidth - transformOrigin.x) * scale + translation.x,
			y2: currentOriginalPosition.y + transformOrigin.y + (originalHeight - transformOrigin.y) * scale + translation.y,
		}
	}
}
