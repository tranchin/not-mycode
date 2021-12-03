package de.tutao.tutanota

import kotlinx.coroutines.runBlocking

// Helper to avoid "JUnit test should return Unit" warning when testing suspend funs with runBlocking
fun testAsync(testBody: suspend () -> Unit): Unit {
	runBlocking {
		testBody()
	}
}