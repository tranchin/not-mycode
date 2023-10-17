export class Vector {
	vector: number[]

	constructor(numbers: number[]) {
		this.vector = numbers
	}

	public length(): number {
		return this.vector.length
	}

	public get(index: number): number {
		return this.vector[index]
	}

	public increment(index: number) {
		this.vector[index]++
	}
}

/**
 * Calculates if two vectors are equal, not related, or one of them is greater/lesser than the other
 * If (greater && less) "vectors are not related"
 * If (!greater && !less) "vectors are equal"
 * If (greater) "vector1 is greater than vector2"
 * If (less) "vector1 is lesser than vector2"
 */
export function vectorEquals(vector1: Vector, vector2: Vector): { greater: boolean; less: boolean } {
	if (vector1.length() != vector2.length()) throw new Error("Cannot compare two Vectors of different lengths")
	let greater = false
	let less = false
	for (let i = 0; i < vector1.length(); i++) {
		vector1.get(i) < vector2.get(i) ? (less = true) : vector1.get(i) > vector2.get(i) ? (greater = true) : {}
	}
	return { greater: greater, less: less }
}
