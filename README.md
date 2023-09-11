# Cpu-Accelerated ByteBeat Renderer
**CABBR** is a powerful renderer for [Bytebeat](http://canonical.org/~kragen/bytebeat/) expressions. It uses Node.JS's Workers to speed up the process (which is why its CPU-accelerated) and [pcm.js](https://github.com/pdeschen/pcm.js/) to make .wav files.
# How to use
Download the repository and extract it somewhere. People that have `git` installed can just do `git clone https://github.com/cabfile/cabbr.git .`

~~Now install the `ini` package by doing `npm i ini`, and if you want to resample audio, also do `npm i wave-resampler`.~~ (As of the auto stereo update these are already done for convinience. *Credit to these npm packages' creators!*)

After doing that, open config.ini. In it you can edit the settings of the renderer, like the type of expression (currently only unsigned bytebeat, signed bytebeat, and floatbeat are supported), and the length of the resulting .wav file. It should look like this (the comments can differ):
```ini
[General]
; 0 = bytebeat, 1 = signed bytebeat, 2 = floatbeat
type=0
; whether the expression returns an array that contains data on left and right channels. Ignore if autoStereo is on
stereo=false
; how long should the output be
seconds=30
; original sample rate
sampleRate=8000

[Quality]
; quality upscale multiplier
; examples:
; 4 = 8000 -> 32000
; 5.5125 = 8000 -> 44100
; 1.378125 = 8000 -> 11025, 32000 -> 44100
upscale=1
; values higher than 0 enable resampling, this is the target sample rate (upscale is not ignored)
resample=0
; can be either point, linear, cubic or sinc (point is generally the best, for sine waves and such use linear)
resampleMethod=point
; the amount of bits in the result, currently only 8 and 16 are supported (16 is slightly broken)
bits=8


[Advanced]
; alternative length constant (based on the t value itself), seconds is ignored if not 0
tLength=0
; the amount of workers that will be working simultaneously (to speed up the process), set to 1 for expressions with a reverb function (or those that dont use a fake t). Set to "max" to use the number of CPU cores availible
workers=1
; Whether to enforce automatic stereo detection. Mainly added for the renderer discord bot to avoid silence. Turn this on if you don't want to worry about a stereo track or not
autoStereo=1

[Misc]
; 0.1 - report every 10th second, 1 - report every second, 2 - report every half second, etc
reportEvery=0.1
; what to do with invalid (NaN) samples: 0 - nothing (set to 0), 1 - skip, 2 - stop the audio, 3 - repeat last sample
invalidSamples=0
```
If you want to imitate [StephanShi's composer](https://github.com/SthephanShinkufag/bytebeat-composer) (or its forks), set `resample` to 48000 and `invalidSamples` to 3.

Make a text file named expr.txt, and put your expression there. Now run the renderer (with `node cabbr`), and a file named out.wav should appear.
# How does it work?
First, it gives each worker (the amount of which is set in the config, they are the ones actually rendering) some settings, and make them render a specific part of the expression. So if you have 4 workers, then each will render 1/4 of it. After all workers are done, it merges their parts, looks for NaN samples (if invalidSamples isnt 0), resamples the audio (if resample isnt 0 or equal to the sample rate, VERY broken with stereo enabled), and upgrades the audio to 16-bit. Lastly, it writes everything it has done into out.wav.
# When not to use Workers
When the expression:
* has persisting variables that change (they will be reset each time a new part is reached)
* doesnt use t (the song will reset each time a new part is reached)
