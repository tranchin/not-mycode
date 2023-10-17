import o from "ospec"
import { OTDocument } from "../../../../src/collaborative-editor/OT/OTDocument.js"
import { OTTransaction } from "../../../../src/collaborative-editor/OT/OTTransaction.js"
import { OTDelete, OTInsert } from "../../../../src/collaborative-editor/OT/OTOperation.js"
import fs from "fs"

o.spec("OTDocument", function () {
	let doc: OTDocument
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	let times: bigint[]
	o.beforeEach(function () {
		doc = new OTDocument(1, 0)
		times = []
	})
	o("inserting characters", function () {
		const str = "Hello, this is a string that should be inserted!"
		const tr = new OTTransaction()
		let i = 0
		str.split("").forEach((c) => {
			tr.addOperation(new OTInsert(i, c, doc.timestamp()))
			i++
		})
		doc.transact(tr)
		o(doc.toString()).deepEquals("Hello, this is a string that should be inserted!")
		// o(doc.timestamp()).deepEquals(new Vector([str.length]))
	})
	o("benchmark for insert algorithm, appending, no conflicts, single user, 2", function () {
		const n = 300000
		const array = Array(n).fill(0)
		for (let i = 0; i < array.length; i++) {
			let start = process.hrtime.bigint()
			const op = new OTInsert(doc.data.length - 1, alphabet.charAt(Math.floor(Math.random() * alphabet.length)), doc.timestamp())
			doc.operate(op)
			let end = process.hrtime.bigint()
			let seconds = end - start
			times.push(seconds)
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/OT/benchmark-2_3.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("benchmark for insert algorithm, random index, no conflicts, single user, 1", function () {
		const array = Array(300000).fill(0)
		for (let i = 0; i < array.length; i++) {
			let start = process.hrtime.bigint()
			const op = new OTInsert(Math.floor(Math.random() * doc.data.length), alphabet.charAt(Math.floor(Math.random() * alphabet.length)), doc.timestamp())
			doc.operate(op)
			let end = process.hrtime.bigint()
			let seconds = end - start
			times.push(seconds)
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/OT/benchmark-1_3.txt")
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
			const op = new OTInsert(Math.floor(Math.random() * doc.data.length), alphabet.charAt(Math.floor(Math.random() * alphabet.length)), doc.timestamp())
			doc.operate(op)
		}

		const n = 100000
		for (let j = 0; j < n; j++) {
			let start = process.hrtime.bigint() // get start time

			// create and apply operation
			const op = new OTInsert(Math.floor(Math.random() * doc.data.length), alphabet.charAt(Math.floor(Math.random() * alphabet.length)), doc.timestamp())
			doc.operate(op)

			let end = process.hrtime.bigint() // get end time
			let seconds = end - start // calculate difference
			times.push(seconds) // add to list of times
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/OT/benchmark-3_6.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("random delete in document of n many characters, no conflicts, single user, 4", function () {
		const n = 100000
		const array = Array(n).fill(0)

		// Prepare document with n many characters
		for (let i = 0; i < n; i++) {
			const op = new OTInsert(Math.floor(Math.random() * doc.data.length), alphabet.charAt(Math.floor(Math.random() * alphabet.length)), doc.timestamp())
			doc.operate(op)
		}

		const m = n
		for (let j = 0; j < m; j++) {
			let start = process.hrtime.bigint() // get start time

			// create and apply operation
			const del = new OTDelete(Math.floor(Math.random() * doc.data.length), doc.timestamp())
			doc.operate(del)

			let end = process.hrtime.bigint() // get end time
			let seconds = end - start // calculate difference
			times.push(seconds) // add to list of times
		}

		let file = fs.createWriteStream("/home/pas/dev/repositories/tutanota-3/test/tests/collaborative-editor/OT/benchmark-3_2.txt")
		file.on("error", function (err) {
			/* error handling */
		})
		times.forEach((n) => {
			file.write(n.toString() + "\n")
		})
		file.end()
	})

	o("deleting character", function () {
		const str = "Hello, this is a string that should be inserted!"
		const tr = new OTTransaction()
		let i = 0
		str.split("").forEach((c) => {
			tr.addOperation(new OTInsert(i, c, doc.timestamp()))
			i++
		})
		doc.transact(tr)
		// const oldLength = str.length
		// o(doc.timestamp()).deepEquals(new Vector([oldLength]))

		const del = new OTDelete(14, doc.timestamp())
		const tr2 = new OTTransaction()
		tr2.addOperation(del)
		tr2.addOperation(del)
		doc.transact(tr2)
		// o(doc.timestamp()).deepEquals(new Vector([oldLength + 2]))
		o(doc.toString()).deepEquals("Hello, this is string that should be inserted!")
	})
})
