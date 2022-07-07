# Tutanota Usage Tests

## Loading all active tests and the user's assignments

Usually done in `app.ts` or similar before rendering anything.

```typescript
// Some implementation of PingAdapter
const pingAdapter = new PingAdapter()

const controller = new UsageTestController()

const tests = [
    new UsageTest("t1", "test 1", 0, true)
] // Or load tests from the server

controller.pingAdapter = pingAdapter
controller.setTests(tests)
```

## Rendering variants for an existing usage test

This section assumes that active tests as well as the associated assignments for the currently logged-in user have been
loaded into the `UsageTestController` class.

The relevant test has two variants in this case.

```typescript
// Within some mithril view
class SomeView implements Component {
	view() {
		const relevantTest = controller.getTest("t1")

		return m("div", relevantTest.renderVariant({
			[0]: () => m("p", "No button here."),
			[1]: () => m("p", ["This is rendered if the user is assigned to variant 1", m(ButtonN, {
				label: () => "Variant 1",
				click: () => {
                    // We want to send one metric that is just a pre-defined number
					const stage = relevantTest.getStage(0)
					stage?.setMetric({
						name: "numberMetric",
						value: "1",
					})
					stage?.complete() // Sends the ping to the server
				},
				icon: () => Icons.Picture,
				type: ButtonType.Dropdown,
			})]),
			[2]: () => m("p", ["This is rendered if the user is assigned to variant 2", m(ButtonN, {
				label: () => "Variant 2",
				click: () => {
					// We want to send one metric that is just a pre-defined number
					const stage = relevantTest.getStage(0)
					stage?.setMetric({
						name: "numberMetric",
						value: "2",
					})
					stage?.complete() // Sends the ping to the server

					// But here, we also want to send a second ping (for stage 1) without metrics
					relevantTest.getStage(1)?.complete()
				},
				icon: () => Icons.Picture,
				type: ButtonType.Dropdown,
			})]),
		}))
	}
}
```
