package com.jnify.jnify_app

import android.app.usage.UsageStatsManager
import android.content.Context
import android.provider.CalendarContract
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "jnify/usage").setMethodCallHandler { call, result ->
            when (call.method) {
                "recentUsage" -> {
                    val sinceMinutes = (call.argument<Int>("sinceMinutes") ?: 60).toLong()
                    result.success(recentUsage(sinceMinutes))
                }
                else -> result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "jnify/calendar").setMethodCallHandler { call, result ->
            when (call.method) {
                "freeSlots" -> {
                    val days = call.argument<Int>("days") ?: 7
                    val minMinutes = call.argument<Int>("minMinutes") ?: 15
                    result.success(freeSlots(days, minMinutes))
                }
                else -> result.notImplemented()
            }
        }
    }

    /** 屏幕使用（UsageStatsManager，分钟级聚合；仅本地，不上传） */
    private fun recentUsage(sinceMinutes: Long): Map<String, Any> {
        return try {
            val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val end = System.currentTimeMillis()
            val start = end - sinceMinutes * 60_000L
            val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, end)
            val filtered = stats.filter { it.packageName != packageName }
            mapOf(
                "totalForegroundMinutes" to (filtered.sumOf { it.totalTimeInForeground } / 60_000L),
                "packages" to filtered
                    .sortedByDescending { it.totalTimeInForeground }
                    .take(10)
                    .map {
                        mapOf(
                            "package" to it.packageName,
                            "minutes" to (it.totalTimeInForeground / 60_000L),
                        )
                    },
            )
        } catch (_: Exception) {
            emptyMap()
        }
    }

    /** 系统日历只读空闲时段（08:00-22:00，未来 N 天，>=minMinutes 连续空闲） */
    private fun freeSlots(days: Int, minMinutes: Int): List<String> {
        val result = mutableListOf<String>()
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        val dayStart = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 8); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        val dayEnd = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 22); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }
        for (d in 0 until days) {
            val start = dayStart.timeInMillis + d * 86_400_000L
            val end = dayEnd.timeInMillis + d * 86_400_000L
            val busy = mutableListOf<Pair<Long, Long>>()
            try {
                val cursor = contentResolver.query(
                    CalendarContract.Events.CONTENT_URI,
                    arrayOf(CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND),
                    "${CalendarContract.Events.DTSTART} < ? AND ${CalendarContract.Events.DTEND} > ?",
                    arrayOf(end.toString(), start.toString()),
                    null,
                )
                cursor?.use {
                    while (it.moveToNext()) {
                        busy.add(it.getLong(0) to it.getLong(1))
                    }
                }
            } catch (_: SecurityException) {
                return emptyList()
            }
            busy.sortBy { it.first }
            var cursorTime = start
            for ((bs, be) in busy) {
                val clampedStart = maxOf(bs, start)
                val clampedEnd = minOf(be, end)
                if (clampedStart > cursorTime && clampedStart - cursorTime >= minMinutes * 60_000L) {
                    result.add(fmt.format(Date(cursorTime)))
                }
                if (clampedEnd > cursorTime) cursorTime = clampedEnd
            }
            if (end - cursorTime >= minMinutes * 60_000L) {
                result.add(fmt.format(Date(cursorTime)))
            }
        }
        return result
    }
}
