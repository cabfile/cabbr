# Cpu-Accelerated ByteBeat Renderer
**CABBR** is a fast and powerful renderer for [Bytebeat](http://canonical.org/~kragen/bytebeat/) expressions. It uses Node.JS's Workers to speed up the process (which is why its CPU-accelerated) and [pcm.js](https://github.com/pdeschen/pcm.js/) to make .wav files.
# How to use
Make sure you have Node.JS and NPM (or any other compatible package manager) installed.

Download the repository and extract it somewhere. People that have `git` installed can just run `git clone https://github.com/cabfile/cabbr.git .`

If you want to use the audio resampling feature, run `npm i wave-resampler`.

After doing that, rename example_config.ini into config.ini. In it you can edit the settings of the renderer, such as the mode and the length of the resulting .wav file. It should look like this (the comments can differ):
```ini
[General]
; 0 = bytebeat, 1 = signed bytebeat, 2 = floatbeat, 3 = funcbeat
mode=0
; how long should the output be
duration=30
; is that in seconds or samples (0 = seconds, 1 = samples)
durationType=0
; original sample rate
sampleRate=8000
[Quality]
; quality upscale multiplier (unsupported in funcbeat)
; examples:
; 4 = 8000 -> 32000
; 5.5125 = 8000 -> 44100
; 1.378125 = 8000 -> 11025, 32000 -> 44100
upscale=1
; values higher than 0 enable resampling (make sure to install the wave-resampler package), this is the target sample rate (upscale is not ignored)
resample=0
; can be either point, linear, cubic or sinc (point is generally the best, for sine waves and such use linear)
resampleMethod=point
; bits per sample in the resulting audio file, currently only 8 and 16 are supported (16 is slightly broken)
bits=8
[Advanced]
; the amount of workers that will be working simultaneously (to speed up the process), or to use every core in the system enter "max" (without quotes)
workers=1
; what to do with invalid (NaN) samples: 0 - nothing (set to 0), 1 - skip, 2 - end the audio, 3 - repeat last sample
invalidSamples=0
[Visual]
; 0 - absolutely no console output (except warnings/errors), 1 - like 2 but with no progress bar or worker status, 2 - default
; for maximum speed use 0
fancy=2
; 0.1 - report every 10 rendered seconds, 1 - report every second, 2 - report every half second, etc. ignored when fancy != 2
reportEvery=0.1
```
If you want to imitate [StephanShi's composer](https://github.com/SthephanShinkufag/bytebeat-composer) (or its forks), set `resample` to 48000, `resampleMethod` to `point`, and `invalidSamples` to 3.

Make a text file named expr.txt, and put your expression there. Now run the renderer (with `node cabbr`), and a file named out.wav should appear. Then you can open it with any audio player you want.
## How to use (on mobile)
Get [Termux](https://f-droid.org/ru/packages/com.termux/). Do NOT download it from Google Play, as that version is old and unsupported.

Installing Node.JS is done with `pkg install nodejs`.
# How does it work?
First, it gives each worker (the amount of which is set in the config, they are the ones actually rendering) some settings, and make them render a specific part of the expression. So if you have 4 workers, each will render 1/4 of it. After all workers are done, it merges their parts, looks for NaN samples (if invalidSamples isnt 0 or 1), resamples the audio (if resample isnt 0 or equal to the sample rate), and upgrades the audio to 16-bit (if bits is equal to 16). Lastly, it writes everything it has done into out.wav.
# When not to use Workers
* The expression has persisting variables that change, e.g. reverb/echo - as they will be reset each time a new part is reached, which isn't that big of a deal, but still undesirable.
* The expression uses its own `t` - the entire song will reset each time a new part is reached.
