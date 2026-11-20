"""Master verified CC0 1.0 real recorded audio packs into compact, peak-normalized,
seamlessly crossfaded .ogg (Vorbis) + .mp3 fallback assets in public/audio/.

Run via Blender 4.5.14 LTS (which bundles Audaspace + libvorbis + libmp3lame + numpy):
  .tools/blender-4.5.14-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/master-cc0-audio.py
"""
import aud, json, hashlib, math, os, sys
from pathlib import Path
import numpy as np

PROJECT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT / '.tools' / 'cc0-audio-src'
OUT_DIR = PROJECT / 'public' / 'audio'
RATE = 44100

# Every source below is verified CC0 1.0 Universal (Public Domain) from OpenGameArt.org.
# Tuple: (cue_name, group, rel_src_path, loop, stereo, start_sec, max_dur_sec, target_peak, source_credit)
CUES = [
    # UI cues (Kenney CC0 RPG Audio + Kenney CC0 Short Music Jingles + CC0 Horn)
    ('select', 'ui', 'kenney_rpg/OGG/metalClick.ogg', False, False, 0.0, 0.45, 0.78, 'Kenney - 50 RPG sound effects (metalClick.ogg, CC0 1.0)'),
    ('order', 'ui', 'kenney_rpg/OGG/beltHandle1.ogg', False, False, 0.0, 0.45, 0.80, 'Kenney - 50 RPG sound effects (beltHandle1.ogg, CC0 1.0)'),
    ('coin', 'ui', 'kenney_rpg/OGG/handleCoins.ogg', False, False, 0.0, 0.65, 0.82, 'Kenney - 50 RPG sound effects (handleCoins.ogg, CC0 1.0)'),
    ('complete', 'ui', 'kenney_jingles/OGG/jingles_STEEL/jingles_STEEL02.ogg', False, False, 0.0, 1.8, 0.82, 'Kenney - 85 Short music jingles (jingles_STEEL02.ogg, CC0 1.0)'),
    ('alarm', 'ui', 'horn_war3.ogg', False, False, 0.0, 1.9, 0.84, 'OpenGameArt - Their Coming horn (theircoming3.ogg, CC0 1.0)'),
    ('victory', 'ui', 'kenney_jingles/OGG/jingles_STEEL/jingles_STEEL00.ogg', False, False, 0.0, 2.4, 0.85, 'Kenney - 85 Short music jingles (jingles_STEEL00.ogg, CC0 1.0)'),

    # Living Economy Foley (Real recorded CC0 Foley)
    ('chop', 'foley', 'kenney_rpg/OGG/chop.ogg', False, False, 0.0, 0.55, 0.84, 'Kenney - 50 RPG sound effects (chop.ogg, CC0 1.0)'),
    ('mine', 'foley', 'breaking_falling/bfh1_rock_hit_01.ogg', False, False, 0.0, 0.55, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_rock_hit_01.ogg, CC0 1.0)'),
    ('hammer', 'foley', 'blacksmith_hammer.wav', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - Blacksmith Hammer (blacksmithhammer.wav, CC0 1.0)'),
    ('anvil', 'foley', 'anvil_forger.ogg', False, False, 0.0, 0.75, 0.84, 'Snabisch - Hammer on Anvil (forger.ogg, CC0 1.0)'),
    ('hoof', 'foley', 'horse_trot.ogg', False, False, 0.0, 0.85, 0.80, 'KobatoGames - Horse Trotting (Trot.ogg, CC0 1.0)'),
    ('march', 'foley', 'rpg_sound_pack/RPG Sound Pack/inventory/chainmail1.wav', False, False, 0.0, 0.65, 0.76, 'Artisticdude/HaelDB - RPG Sound Pack (chainmail1.wav, CC0 1.0)'),
    ('fire', 'foley', 'fire_loop.wav', False, False, 0.5, 1.6, 0.78, 'StarNinjas - Fireplace Sound loop (fire.wav, CC0 1.0)'),

    # Combat Foley (4 variations per impact class, real CC0 recordings)
    ('metal-0', 'combat', 'sword_clash/sword_clash.1.ogg', False, False, 0.0, 0.85, 0.86, 'StarNinjas - 20 Sword Sound Effects (sword_clash.1.ogg, CC0 1.0)'),
    ('metal-1', 'combat', 'sword_clash/sword_clash.2.ogg', False, False, 0.0, 0.85, 0.86, 'StarNinjas - 20 Sword Sound Effects (sword_clash.2.ogg, CC0 1.0)'),
    ('metal-2', 'combat', 'sword_clash/sword_clash.4.ogg', False, False, 0.0, 0.85, 0.86, 'StarNinjas - 20 Sword Sound Effects (sword_clash.4.ogg, CC0 1.0)'),
    ('metal-3', 'combat', 'sword_clash/sword_clash.7.ogg', False, False, 0.0, 0.85, 0.86, 'StarNinjas - 20 Sword Sound Effects (sword_clash.7.ogg, CC0 1.0)'),

    ('arrow-0', 'combat', 'battle_sfx/battle_sound_effects/Bow.wav', False, False, 0.0, 0.60, 0.84, 'remaxim - Battle Sound Effects (Bow.wav, CC0 1.0)'),
    ('arrow-1', 'combat', 'battle_sfx/battle_sound_effects/swish_2.wav', False, False, 0.0, 0.50, 0.82, 'remaxim - Battle Sound Effects (swish_2.wav, CC0 1.0)'),
    ('arrow-2', 'combat', 'battle_sfx/battle_sound_effects/swish_3.wav', False, False, 0.0, 0.50, 0.82, 'remaxim - Battle Sound Effects (swish_3.wav, CC0 1.0)'),
    ('arrow-3', 'combat', 'battle_sfx/battle_sound_effects/swish_4.wav', False, False, 0.0, 0.50, 0.82, 'remaxim - Battle Sound Effects (swish_4.wav, CC0 1.0)'),

    ('wood-0', 'combat', 'breaking_falling/bfh1_wood_hit_01.ogg', False, False, 0.0, 0.65, 0.86, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_wood_hit_01.ogg, CC0 1.0)'),
    ('wood-1', 'combat', 'breaking_falling/bfh1_wood_hit_02.ogg', False, False, 0.0, 0.65, 0.86, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_wood_hit_02.ogg, CC0 1.0)'),
    ('wood-2', 'combat', 'breaking_falling/bfh1_wood_hit_03.ogg', False, False, 0.0, 0.65, 0.86, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_wood_hit_03.ogg, CC0 1.0)'),
    ('wood-3', 'combat', 'breaking_falling/bfh1_wood_breaking_01.ogg', False, False, 0.0, 0.75, 0.86, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_wood_breaking_01.ogg, CC0 1.0)'),

    ('siege-0', 'combat', 'breaking_falling/bfh1_rock_breaking_01.ogg', False, False, 0.0, 1.35, 0.90, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_rock_breaking_01.ogg, CC0 1.0)'),
    ('siege-1', 'combat', 'breaking_falling/bfh1_rock_breaking_02.ogg', False, False, 0.0, 1.35, 0.90, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_rock_breaking_02.ogg, CC0 1.0)'),
    ('siege-2', 'combat', 'breaking_falling/bfh1_rock_breaking_03.ogg', False, False, 0.0, 1.35, 0.90, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_rock_breaking_03.ogg, CC0 1.0)'),
    ('siege-3', 'combat', 'breaking_falling/bfh1_breaking_01.ogg', False, False, 0.0, 1.35, 0.90, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_breaking_01.ogg, CC0 1.0)'),

    ('earth-0', 'combat', 'breaking_falling/bfh1_hit_01.ogg', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_hit_01.ogg, CC0 1.0)'),
    ('earth-1', 'combat', 'breaking_falling/bfh1_hit_03.ogg', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_hit_03.ogg, CC0 1.0)'),
    ('earth-2', 'combat', 'breaking_falling/bfh1_hit_05.ogg', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_hit_05.ogg, CC0 1.0)'),
    ('earth-3', 'combat', 'breaking_falling/bfh1_hit_08.ogg', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_hit_08.ogg, CC0 1.0)'),

    # War Horn & Real Human Unit Voice / Battle Grunt Cues
    ('horn', 'voice', 'horn_war.ogg', False, False, 0.0, 2.2, 0.86, 'OpenGameArt - Their Coming war horn (theircoming.ogg, CC0 1.0)'),
    ('voice-select', 'voice', 'voiceover_kenney/Male/ready.ogg', False, False, 0.0, 1.1, 0.82, 'Kenney - Voiceover Pack (Male/ready.ogg, CC0 1.0)'),
    ('voice-order', 'voice', 'voiceover_kenney/Male/go.ogg', False, False, 0.0, 1.0, 0.82, 'Kenney - Voiceover Pack (Male/go.ogg, CC0 1.0)'),
    ('voice-attack', 'voice', 'voiceover_kenney/Male/war_target_engaged.ogg', False, False, 0.0, 1.5, 0.82, 'Kenney - Voiceover Pack (Male/war_target_engaged.ogg, CC0 1.0)'),
    ('voice-work', 'voice', 'voiceover_kenney/Male/set.ogg', False, False, 0.0, 1.0, 0.82, 'Kenney - Voiceover Pack (Male/set.ogg, CC0 1.0)'),
    ('grunt-0', 'voice', 'hit_dying/ogg/hit1.ogg', False, False, 0.0, 0.70, 0.80, 'alket - 5 Hit Sounds + Dying (hit1.ogg, CC0 1.0)'),
    ('grunt-1', 'voice', 'hit_dying/ogg/hit3.ogg', False, False, 0.0, 0.70, 0.80, 'alket - 5 Hit Sounds + Dying (hit3.ogg, CC0 1.0)'),
    ('grunt-2', 'voice', 'hit_dying/ogg/die1.ogg', False, False, 0.0, 0.90, 0.80, 'alket - 5 Hit Sounds + Dying (die1.ogg, CC0 1.0)'),

    # Seamless Crossfaded Weather & Biome Ambience Field Recordings
    ('rain', 'weather', 'rain_ogg/1.ogg', True, False, 0.5, 10.0, 0.70, 'Snabisch - Rain loopable (1.ogg, CC0 1.0)'),
    ('amb-meadow', 'weather', 'birds_meadow.ogg', True, False, 0.5, 11.0, 0.72, 'Isaiah658 - Ambient Bird Sounds (birds-isaiah658.ogg, CC0 1.0)'),
    ('amb-coast', 'weather', 'ocean_wave_prev.ogg', True, False, 0.4, 10.0, 0.72, 'Jasinski - Beach Ocean Waves (CC0 1.0)'),
    ('amb-river', 'weather', 'water_wave_prev.ogg', True, False, 0.4, 10.0, 0.70, 'Transitking - Water Waves / River (CC0 1.0)'),
    ('amb-tundra', 'weather', 'wind_loop.ogg', True, False, 0.2, 9.5, 0.72, 'WolfTech - Wind (Wind.ogg, CC0 1.0)'),
    ('amb-arid', 'weather', 'wind1.wav', True, False, 0.5, 9.5, 0.68, 'qubodup - Wind field recording (wind1.wav, CC0 1.0)'),
    ('amb-volcanic', 'weather', 'dungeon_rumble.ogg', True, False, 0.5, 10.5, 0.72, 'IgnasD - Loopable Dungeon Ambience rumble (dungeon_ambient_1.ogg, CC0 1.0)'),

    # Adaptive 4-Tier Real Medieval Music Stems + Exploration Pad (seamless crossfaded loops!)
    ('pad', 'music', 'music_peace_bard.mp3', True, True, 2.0, 22.0, 0.72, 'RandomMind / Flixberry - Medieval: The Bard Tale (CC0 1.0)'),
    ('music-peace', 'music', 'music_peace_inn.mp3', True, True, 1.0, 24.0, 0.74, 'RandomMind / AntumDeluge - Medieval: The Old Tower Inn (CC0 1.0)'),
    ('music-tension', 'music', 'music_tension_lament.mp3', True, True, 2.0, 24.0, 0.74, 'RandomMind / Snabisch - Fantasy: Lament for a Warriors Soul (CC0 1.0)'),
    ('music-battle', 'music', 'music_battle_a.mp3', True, True, 1.0, 24.0, 0.76, 'CynicMusic / JaidynReiman - Battle Theme A (CC0 1.0)'),
    ('music-climax', 'music', 'music_climax_choir.mp3', True, True, 1.0, 22.0, 0.78, 'Snabisch - Fantasy Choir 1 (CC0 1.0)'),
]


def load_pcm(src_path: Path, stereo: bool) -> np.ndarray:
    s = aud.Sound(str(src_path))
    s = s.resample(RATE, False)
    s = s.rechannel(2 if stereo else 1)
    data = np.asarray(s.data(), dtype=np.float32)
    if data.ndim == 1:
        data = data[:, None]
    return data


def trim_silence(pcm: np.ndarray, thresh: float = 0.008) -> np.ndarray:
    mag = np.max(np.abs(pcm), axis=1)
    active = np.flatnonzero(mag > thresh)
    if len(active) < 64:
        return pcm
    lead = max(0, int(active[0]) - int(0.006 * RATE))
    tail = min(len(pcm), int(active[-1]) + int(0.045 * RATE))
    return pcm[lead:tail]


def make_seamless_loop(pcm: np.ndarray, start_sec: float, target_dur: float) -> np.ndarray:
    n = len(pcm)
    start = int(start_sec * RATE)
    if start >= n - RATE:
        start = 0
    avail = n - start
    # Reserve crossfade overlap at tail to wrap smoothly onto head
    xfade = min(int(1.6 * RATE), max(int(0.25 * RATE), int(avail * 0.16)))
    want = int(target_dur * RATE)
    if avail <= want + xfade:
        # Use maximum available segment cleanly
        seg_len = max(int(0.8 * RATE), avail - xfade)
    else:
        seg_len = want
    if seg_len + xfade > avail:
        xfade = max(int(0.15 * RATE), avail // 6)
        seg_len = avail - xfade
    body = pcm[start : start + seg_len].copy()
    tail = pcm[start + seg_len : start + seg_len + xfade]
    # Equal-power cosine crossfade from tail back into head for zero-click seamless loop
    t = np.linspace(0.0, math.pi * 0.5, xfade, dtype=np.float32)[:, None]
    body[:xfade] = body[:xfade] * np.sin(t) + tail * np.cos(t)
    return body


def process_oneshot(pcm: np.ndarray, start_sec: float, max_dur: float) -> np.ndarray:
    start = int(start_sec * RATE)
    if start < len(pcm) - 256:
        pcm = pcm[start:]
    pcm = trim_silence(pcm)
    max_frames = int(max_dur * RATE)
    if len(pcm) > max_frames:
        pcm = pcm[:max_frames].copy()
    # Micro fade-in (3 ms) and clean fade-out (22 ms) to guarantee zero pops
    fi = min(int(0.003 * RATE), len(pcm) // 4)
    fo = min(int(0.028 * RATE), len(pcm) // 3)
    if fi > 1:
        pcm[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    if fo > 1:
        pcm[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[:, None]
    return pcm


def normalize(pcm: np.ndarray, target_peak: float) -> np.ndarray:
    # Remove DC offset first
    pcm = pcm - np.mean(pcm, axis=0, keepdims=True)
    peak = float(np.max(np.abs(pcm)))
    if peak < 1e-5:
        raise RuntimeError('Audio cue is silent')
    gain = target_peak / peak
    out = np.clip(pcm * gain, -0.98, 0.98).astype(np.float32)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Remove legacy synthetic .wav files and stale outputs before writing real CC0 pack
    for old in OUT_DIR.iterdir():
        if old.suffix.lower() in {'.wav', '.ogg', '.mp3'}:
            old.unlink()

    manifest_cues = {}
    license_lines = [
        'CC0 1.0 Universal (Public Domain Dedication)',
        'https://creativecommons.org/publicdomain/zero/1.0/',
        '',
        'All audio assets in /audio/ are real recorded studio and field-recorded CC0 1.0',
        'Public Domain audio files mastered offline for Crowns of the Frontier by',
        'scripts/master-cc0-audio.py (encoded to gapless 44.1 kHz Ogg Vorbis with',
        'universal MP3 fallback for Safari/iOS). All files are bundled locally for',
        '100% offline playback with zero runtime network dependencies.',
        '',
        'The runtime retains a procedural Web Audio fallback so the game remains',
        'playable even if audio assets cannot be fetched or decoded.',
        '',
        'Verified CC0 1.0 Source Provenance (per cue):',
    ]

    total_ogg = 0
    total_mp3 = 0

    for name, group, rel_src, loop, stereo, start_sec, max_dur, target_peak, credit in CUES:
        src = SRC_DIR / rel_src
        if not src.is_file():
            raise FileNotFoundError(f'Missing CC0 source for {name}: {src}')
        pcm = load_pcm(src, stereo)
        if loop:
            pcm = make_seamless_loop(pcm, start_sec, max_dur)
        else:
            pcm = process_oneshot(pcm, start_sec, max_dur)
        pcm = normalize(pcm, target_peak)

        dur = round(len(pcm) / RATE, 3)
        rms = float(np.sqrt(np.mean(pcm * pcm)))
        peak = float(np.max(np.abs(pcm)))
        if peak < 0.15 or rms < 0.008:
            raise RuntimeError(f'Cue {name} has insufficient signal (peak={peak:.3f}, rms={rms:.4f})')

        snd = aud.Sound.buffer(pcm, RATE)
        ogg_name = f'{name}.ogg'
        mp3_name = f'{name}.mp3'
        ogg_path = OUT_DIR / ogg_name
        mp3_path = OUT_DIR / mp3_name

        # Compact bitrates: 64 kbps mono SFX/ambience, 72 kbps stereo music stems
        ogg_br = 72000 if stereo else 64000
        mp3_br = 72000 if stereo else 64000
        ch = aud.CHANNELS_STEREO if stereo else aud.CHANNELS_MONO

        snd.write(str(ogg_path), RATE, ch, aud.FORMAT_FLOAT32, aud.CONTAINER_OGG, aud.CODEC_VORBIS, ogg_br)
        snd.write(str(mp3_path), RATE, ch, aud.FORMAT_FLOAT32, aud.CONTAINER_MP3, aud.CODEC_MP3, mp3_br)

        ogg_bytes = ogg_path.read_bytes()
        mp3_bytes = mp3_path.read_bytes()
        total_ogg += len(ogg_bytes)
        total_mp3 += len(mp3_bytes)

        manifest_cues[name] = {
            'file': ogg_name,
            'fallbackFile': mp3_name,
            'group': group,
            'channels': 2 if stereo else 1,
            'duration': dur,
            'bytes': len(ogg_bytes),
            'fallbackBytes': len(mp3_bytes),
            'loop': loop,
            'sha256': hashlib.sha256(ogg_bytes).hexdigest(),
            'fallbackSha256': hashlib.sha256(mp3_bytes).hexdigest(),
            'source': credit,
        }
        license_lines.append(f'- {name} ({ogg_name} / {mp3_name}): {credit}')
        print(f'OK {name:14s} dur={dur:5.2f}s ogg={len(ogg_bytes):7d}B mp3={len(mp3_bytes):7d}B rms={rms:.3f}')

    manifest = {
        'schema': 2,
        'generatedBy': 'scripts/master-cc0-audio.py',
        'sampleRate': RATE,
        'encoding': 'ogg_vorbis',
        'fallbackEncoding': 'mp3',
        'license': 'CC0-1.0',
        'proceduralFallback': True,
        'totalOggBytes': total_ogg,
        'totalMp3Bytes': total_mp3,
        'cues': manifest_cues,
    }
    (OUT_DIR / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (PROJECT / 'public' / 'AUDIO_LICENSES.txt').write_text('\n'.join(license_lines) + '\n', encoding='utf-8')
    print(json.dumps({
        'passed': True,
        'cues': len(manifest_cues),
        'totalOggBytes': total_ogg,
        'totalMp3Bytes': total_mp3,
        'totalMB': round((total_ogg + total_mp3) / (1024 * 1024), 2),
    }))


if __name__ == '__main__':
    main()
