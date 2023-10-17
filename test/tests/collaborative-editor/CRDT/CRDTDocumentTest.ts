import o from "ospec"
import { OTDocument } from "../../../../src/collaborative-editor/OT/OTDocument.js"
import { OTTransaction } from "../../../../src/collaborative-editor/OT/OTTransaction.js"
import { OTDelete, OTInsert } from "../../../../src/collaborative-editor/OT/OTOperation.js"
import fs from "fs"
import { CRDTDocument } from "../../../../src/collaborative-editor/CRDT/CRDTDocument.js"
import { CRDTTransaction } from "../../../../src/collaborative-editor/CRDT/CRDTTransaction.js"
import { CRDTDelete, CRDTInsert } from "../../../../src/collaborative-editor/CRDT/CRDTOperation.js"

o.spec("CRDTDocument", function () {
	let doc: CRDTDocument
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let times: bigint[]
	o.beforeEach(function () {
		doc = new CRDTDocument(1, 0)
		times = []
	})

	o("inserting characters", function () {
		const str = "Hello, this is a string that should be inserted!"
		const tr = new CRDTTransaction()
		const charArray = str.split("")
		for (let i = 0; i < charArray.length; i++) {
			let op
			if (i == 0) {
				op = new CRDTInsert(i, charArray[i], null, null, doc.timestamp())
			} else {
				const prevOp = doc.data.find((op) => (op.id = i - 1))
				if (prevOp) {
					op = new CRDTInsert(i, charArray[i], prevOp, null, doc.timestamp())
				} else {
					op = new CRDTInsert(i, charArray[i], doc.data[i - 1], null, doc.timestamp())
				}
			}
			tr.addOperation(op)
		}
		doc.transact(tr)
		o(doc.toString()).deepEquals(str)
	})

	o.only("benchmark for insert algorithm, random index, no conflicts, single user, 1", function () {
		const n = 200000

		const array = Array(n).fill(0)
		for (let i = 0; i < array.length; i++) {
			let anchor
			let leftOfAnchor
			if (doc.data.length > 0) {
				anchor = doc.data[Math.floor(Math.random() * doc.data.length)]
				if (anchor.hasLeft()) {
					leftOfAnchor = anchor.getLeft()
				}
			}

			let start = process.hrtime.bigint()
			const op = new CRDTInsert(i, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), leftOfAnchor, anchor, doc.timestamp())
			doc.operate(op)
			let end = process.hrtime.bigint()

			let seconds = end - start
			times.push(seconds)
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/CRDT/benchmark-1_4.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("benchmark for insert algorithm, appending, no conflicts, single user, 2", function () {
		const n = 300000
		const array = Array(n).fill(0)

		for (let i = 0; i < array.length; i++) {
			let anchor
			if (doc.data.length > 0) {
				anchor = doc.data[i]
			}

			let start = process.hrtime.bigint()
			const op = new CRDTInsert(i, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), anchor, null, doc.timestamp())
			doc.operate(op)
			let end = process.hrtime.bigint()
			let seconds = end - start
			times.push(seconds)
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/CRDT/benchmark-2_3.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("benchmark for insert algorithm, prepared document with m many characters, random index, no conflicts, single user, 3", function () {
		const m = 300000
		const array = Array(m).fill(0)

		// Prepare document with m many characters
		for (let i = 0; i < m; i++) {
			let anchor
			let leftOfAnchor
			if (doc.data.length > 0) {
				anchor = doc.data[Math.floor(Math.random() * doc.data.length)]
				if (anchor.hasLeft()) {
					leftOfAnchor = anchor.getLeft()
				}
			}

			const op = new CRDTInsert(i, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), leftOfAnchor, anchor, doc.timestamp())
			doc.operate(op)
		}

		const n = 100000
		for (let j = 0; j < n; j++) {
			let anchor
			let leftOfAnchor
			anchor = doc.data[Math.floor(Math.random() * doc.data.length)]
			if (anchor.hasLeft()) {
				leftOfAnchor = anchor.getLeft()
			}

			let start = process.hrtime.bigint() // get start time
			const op = new CRDTInsert(j, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), leftOfAnchor, anchor, doc.timestamp())
			doc.operate(op)
			let end = process.hrtime.bigint() // get end time

			let seconds = end - start // calculate difference
			times.push(seconds) // add to list of times
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/CRDT/benchmark-3_6.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("benchmark for delete algorithm, prepared document with m many characters, random index, no conflicts, single user, 4", function () {
		const m = 100000
		const array = Array(m).fill(0)

		// Prepare document with m many characters
		for (let i = 0; i < m; i++) {
			let anchor: CRDTInsert | null = null
			let leftOfAnchor
			if (doc.data.length > 0) {
				const randomIndex = Math.floor(Math.random() * doc.data.length)
				anchor = doc.data[randomIndex]
				if (anchor.hasLeft()) {
					const leftId = anchor.getLeft().getId()
					leftOfAnchor = doc.data.find((o) => o.id == leftId)
				}
			}

			const op = new CRDTInsert(i, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), leftOfAnchor, anchor, doc.timestamp())
			doc.operate(op)
		}

		const n = m
		for (let j = 0; j < n; j++) {
			let anchor
			anchor = doc.data[Math.floor(Math.random() * doc.data.length)]

			let start = process.hrtime.bigint() // get start time
			const del = new CRDTDelete(j, anchor, doc.timestamp())
			doc.operate(del)
			let end = process.hrtime.bigint() // get end time

			let seconds = end - start // calculate difference
			times.push(seconds) // add to list of times
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/CRDT/benchmark-5_2.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})
})
