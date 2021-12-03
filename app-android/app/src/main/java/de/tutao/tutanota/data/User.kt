package de.tutao.tutanota.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity
data class User(@field:PrimaryKey val userId: String)