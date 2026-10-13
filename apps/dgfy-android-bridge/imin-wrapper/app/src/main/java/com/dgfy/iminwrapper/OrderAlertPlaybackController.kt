package com.dgfy.iminwrapper

import android.content.Context
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.HandlerThread
import java.io.File

/**
 * Owns native order-alert playback away from the WebView/UI thread.
 *
 * A prepared MediaPlayer is reused for repeated alerts. This avoids decoding
 * the same file synchronously on the Activity thread every time the Web POS
 * timer fires.
 */
class OrderAlertPlaybackController(
    context: Context,
    private val soundStore: OrderAlertSoundStore
) {
    private val applicationContext = context.applicationContext
    private val audioThread = HandlerThread(AUDIO_THREAD_NAME)
    private val audioHandler: Handler

    @Volatile
    private var released = false

    // All fields below are accessed only from audioHandler's looper.
    private var playbackGeneration = 0L
    private var activePlayer: MediaPlayer? = null
    private var activeSoundPath: String? = null
    private var activePlayerPrepared = false
    private var orderAlertRingtone: Ringtone? = null
    private var orderAlertToneGenerator: ToneGenerator? = null

    init {
        audioThread.start()
        audioHandler = Handler(audioThread.looper)
        audioHandler.post {
            if (released) return@post
            orderAlertToneGenerator = runCatching {
                ToneGenerator(AudioManager.STREAM_NOTIFICATION, TONE_GENERATOR_VOLUME)
            }.getOrNull()
            orderAlertRingtone = resolveOrderAlertRingtone()
        }
    }

    fun play(soundType: String) {
        if (released) return

        val normalizedSoundType = soundType.trim().ifEmpty { DEFAULT_SOUND_TYPE }
        audioHandler.post {
            if (released) return@post

            val savedSound = soundStore.fileFor(normalizedSoundType)
            val savedSoundPath = savedSound?.absolutePath
            if (savedSoundPath != null && activeSoundPath == savedSoundPath && activePlayer != null) {
                stopFallbackPlayback()
                if (activePlayerPrepared) {
                    restartPreparedPlayer()
                }
                // A player that is still preparing will start from its prepared
                // callback. Do not create another decoder for the same file.
                return@post
            }

            playbackGeneration += 1
            releaseActivePlayer()
            stopFallbackPlayback()

            if (savedSound != null) {
                prepareSavedOrderAlert(savedSound, playbackGeneration)
            } else {
                playDefaultOrderAlert()
            }
        }
    }

    fun stop() {
        if (released) return

        audioHandler.post {
            if (released) return@post
            playbackGeneration += 1
            releaseActivePlayer()
            stopFallbackPlayback()
        }
    }

    fun release() {
        if (released) return
        released = true

        audioHandler.post {
            playbackGeneration += 1
            releaseActivePlayer()
            stopFallbackPlayback()
            orderAlertRingtone = null
            orderAlertToneGenerator?.release()
            orderAlertToneGenerator = null
            audioThread.quitSafely()
        }
    }

    private fun resolveOrderAlertRingtone(): Ringtone? {
        val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: return null

        return runCatching {
            RingtoneManager.getRingtone(applicationContext, notificationUri)
        }.getOrNull()
    }

    private fun prepareSavedOrderAlert(soundFile: File, generation: Long) {
        val player = MediaPlayer()
        activePlayer = player
        activeSoundPath = soundFile.absolutePath
        activePlayerPrepared = false

        try {
            player.setDataSource(soundFile.absolutePath)
            player.setOnPreparedListener { preparedPlayer ->
                if (
                    released
                    || generation != playbackGeneration
                    || activePlayer !== preparedPlayer
                ) {
                    runCatching { preparedPlayer.release() }
                    return@setOnPreparedListener
                }

                activePlayerPrepared = true
                try {
                    preparedPlayer.start()
                } catch (_: Exception) {
                    handlePlayerFailure(preparedPlayer, generation)
                }
            }
            player.setOnCompletionListener { completedPlayer ->
                if (activePlayer === completedPlayer && generation == playbackGeneration) {
                    // Keep the prepared decoder so the next two-second alert
                    // can rewind and start without preparing again.
                    activePlayerPrepared = true
                }
            }
            player.setOnErrorListener { failedPlayer, _, _ ->
                if (activePlayer === failedPlayer && generation == playbackGeneration) {
                    clearActivePlayer(failedPlayer)
                    runCatching { failedPlayer.release() }
                    playDefaultOrderAlert()
                } else {
                    runCatching { failedPlayer.release() }
                }
                true
            }
            player.prepareAsync()
        } catch (_: Exception) {
            if (activePlayer === player) {
                clearActivePlayer(player)
                runCatching { player.release() }
                playDefaultOrderAlert()
            } else {
                runCatching { player.release() }
            }
        }
    }

    private fun restartPreparedPlayer() {
        val player = activePlayer ?: return
        try {
            player.seekTo(0)
            player.start()
        } catch (_: Exception) {
            clearActivePlayer(player)
            runCatching { player.release() }
            playDefaultOrderAlert()
        }
    }

    private fun handlePlayerFailure(player: MediaPlayer, generation: Long) {
        if (activePlayer !== player || generation != playbackGeneration || released) {
            runCatching { player.release() }
            return
        }

        clearActivePlayer(player)
        runCatching { player.release() }
        playDefaultOrderAlert()
    }

    private fun releaseActivePlayer() {
        val player = activePlayer ?: run {
            activeSoundPath = null
            activePlayerPrepared = false
            return
        }

        clearActivePlayer(player)
        runCatching { player.stop() }
        runCatching { player.release() }
    }

    private fun clearActivePlayer(player: MediaPlayer) {
        if (activePlayer === player) {
            activePlayer = null
            activeSoundPath = null
            activePlayerPrepared = false
        }
    }

    private fun stopFallbackPlayback() {
        try {
            orderAlertRingtone?.stop()
        } catch (_: Exception) {
            // Ignore cleanup failures from a ringtone that already ended.
        }

        try {
            orderAlertToneGenerator?.stopTone()
        } catch (_: Exception) {
            // Ignore cleanup failures from a tone that already ended.
        }
    }

    private fun playDefaultOrderAlert() {
        if (released) return

        val ringtone = orderAlertRingtone
        if (ringtone != null) {
            try {
                if (ringtone.isPlaying) ringtone.stop()
                ringtone.play()
                return
            } catch (_: Exception) {
                // Fall back to a short notification tone if the ringtone cannot play.
            }
        }

        try {
            orderAlertToneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP2, 250)
        } catch (_: Exception) {
            // Ignore tone playback failures to avoid crashing the POS shell.
        }
    }

    companion object {
        private const val AUDIO_THREAD_NAME = "dgfy-order-alert-audio"
        private const val DEFAULT_SOUND_TYPE = "new_order"
        private const val TONE_GENERATOR_VOLUME = 100
    }
}
