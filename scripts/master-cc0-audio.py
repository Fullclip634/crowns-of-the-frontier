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
TAU = math.pi * 2.0

# Every source below is verified CC0 1.0 Universal (Public Domain) from OpenGameArt.org
# or original studio acoustic synthesis dedicated to CC0 1.0 by this project.
# Tuple: (cue_name, group, rel_src_path_or_recipe, loop, stereo, start_sec, max_dur_sec, target_peak, source_credit)
CUES = [
    # UI, Heraldic Alerts, Diplomacy & Battle Chat Cues
    ('select', 'ui', 'kenney_rpg/OGG/metalClick.ogg', False, False, 0.0, 0.45, 0.78, 'Kenney - 50 RPG sound effects (metalClick.ogg, CC0 1.0)'),
    ('order', 'ui', 'kenney_rpg/OGG/beltHandle1.ogg', False, False, 0.0, 0.45, 0.80, 'Kenney - 50 RPG sound effects (beltHandle1.ogg, CC0 1.0)'),
    ('coin', 'ui', 'kenney_rpg/OGG/handleCoins.ogg', False, False, 0.0, 0.65, 0.82, 'Kenney - 50 RPG sound effects (handleCoins.ogg, CC0 1.0)'),
    ('complete', 'ui', 'recipe:complete', False, False, 0.0, 1.25, 0.82, 'Crowns of the Frontier Studio Mastering + Kenney metalClick.ogg (CC0 1.0)'),
    ('alarm', 'ui', 'recipe:alarm', False, False, 0.0, 1.85, 0.86, 'OpenGameArt war horn (horn_war3.ogg) + RPG Sound Pack metal-ringing.wav + Watchtower Bell mastering (CC0 1.0)'),
    ('victory', 'ui', 'recipe:victory', False, False, 0.0, 2.85, 0.86, 'Snabisch - Fantasy Choir 1 (music_climax_choir.mp3) + Royal Brass Fanfare mastering (CC0 1.0)'),
    ('defeat', 'ui', 'recipe:defeat', False, False, 0.0, 2.65, 0.82, 'RandomMind / Snabisch - Lament for a Warriors Soul (music_tension_lament.mp3) + Low Horn mastering (CC0 1.0)'),
    ('age-up', 'ui', 'recipe:age-up', False, False, 0.0, 2.25, 0.86, 'Snabisch - Fantasy Choir 1 (music_climax_choir.mp3) + Royal Herald Brass mastering (CC0 1.0)'),
    ('chat-all', 'ui', 'recipe:chat-all', False, False, 0.0, 0.42, 0.76, 'Kenney - 50 RPG sound effects (bookFlip1.ogg) + Bronze Chime mastering (CC0 1.0)'),
    ('chat-team', 'ui', 'recipe:chat-team', False, False, 0.0, 0.52, 0.80, 'Kenney - 50 RPG sound effects (bookFlip1.ogg) + Allied Double-Bell Chime mastering (CC0 1.0)'),
    ('flare', 'ui', 'recipe:flare', False, False, 0.0, 0.72, 0.84, 'Artisticdude/HaelDB - RPG Sound Pack (metal-ringing.wav) + Tactical Bronze Beacon mastering (CC0 1.0)'),
    ('tribute', 'ui', 'recipe:tribute', False, False, 0.0, 0.82, 0.84, 'Kenney handleCoins2.ogg + RPG Sound Pack coin.wav + Medieval Harp Chord mastering (CC0 1.0)'),
    ('notice-warn', 'ui', 'recipe:notice-warn', False, False, 0.0, 0.28, 0.72, 'Artisticdude/HaelDB - RPG Sound Pack (interface6.wav, warmed muted knock, CC0 1.0)'),
    ('place', 'ui', 'recipe:place', False, False, 0.0, 0.42, 0.82, 'OpenGameArt 75 CC0 SFX (bfh1_wood_hit_02.ogg, bfh1_rock_hit_01.ogg) + Blacksmith Hammer placement mastering (CC0 1.0)'),
    ('bld-town', 'ui', 'recipe:bld-town', False, False, 0.0, 0.58, 0.76, 'Kenney - 50 RPG sound effects (doorOpen_1.ogg) + Medieval Harp guildhall mastering (CC0 1.0)'),
    ('bld-castle', 'ui', 'recipe:bld-castle', False, False, 0.0, 0.62, 0.80, 'Artisticdude/HaelDB door.wav + Kenney metalLatch.ogg + Castle Portcullis mastering (CC0 1.0)'),
    ('bld-dock', 'ui', 'recipe:bld-dock', False, False, 0.0, 0.65, 0.78, 'Kenney creak2.ogg + Jasinski ocean_wave_prev.ogg + Ship Bell mastering (CC0 1.0)'),

    # Living Economy Foley & Siege/Hero Action Stingers (Real recorded CC0 Foley)
    ('chop', 'foley', 'kenney_rpg/OGG/chop.ogg', False, False, 0.0, 0.55, 0.84, 'Kenney - 50 RPG sound effects (chop.ogg, CC0 1.0)'),
    ('mine', 'foley', 'breaking_falling/bfh1_rock_hit_01.ogg', False, False, 0.0, 0.55, 0.84, 'OpenGameArt - 75 CC0 breaking/falling/hit SFX (bfh1_rock_hit_01.ogg, CC0 1.0)'),
    ('hammer', 'foley', 'blacksmith_hammer.wav', False, False, 0.0, 0.60, 0.84, 'OpenGameArt - Blacksmith Hammer (blacksmithhammer.wav, CC0 1.0)'),
    ('anvil', 'foley', 'anvil_forger.ogg', False, False, 0.0, 0.75, 0.84, 'Snabisch - Hammer on Anvil (forger.ogg, CC0 1.0)'),
    ('hoof', 'foley', 'horse_trot.ogg', False, False, 0.0, 0.85, 0.80, 'KobatoGames - Horse Trotting (Trot.ogg, CC0 1.0)'),
    ('march', 'foley', 'rpg_sound_pack/RPG Sound Pack/inventory/chainmail1.wav', False, False, 0.0, 0.65, 0.76, 'Artisticdude/HaelDB - RPG Sound Pack (chainmail1.wav, CC0 1.0)'),
    ('fire', 'foley', 'fire_loop.wav', False, False, 0.5, 1.6, 0.78, 'StarNinjas - Fireplace Sound loop (fire.wav, CC0 1.0)'),
    ('cannon', 'foley', 'recipe:cannon', False, False, 0.0, 1.22, 0.90, 'OpenGameArt 75 CC0 SFX (bfh1_breaking_01.ogg, bfh1_rock_breaking_01.ogg) + Black-Powder Bombard mastering (CC0 1.0)'),
    ('trebuchet', 'foley', 'recipe:trebuchet', False, False, 0.0, 0.95, 0.86, 'Kenney creak1.ogg + remaxim Bow.wav + OpenGameArt swish-1.wav + Trebuchet mastering (CC0 1.0)'),
    ('collapse', 'foley', 'recipe:collapse', False, False, 0.0, 1.45, 0.90, 'OpenGameArt 75 CC0 SFX (bfh1_breaking_02.ogg, bfh1_rock_breaking_02.ogg, bfh1_wood_breaking_02.ogg, bfh1_rock_falling_02.ogg, CC0 1.0)'),
    ('hero-skill', 'foley', 'recipe:hero-skill', False, False, 0.0, 1.35, 0.86, 'Artisticdude/HaelDB sword-unsheathe2.wav & magic1.wav + Royal Horn Hero Stinger mastering (CC0 1.0)'),
    ('boiling-oil', 'foley', 'recipe:boiling-oil', False, False, 0.0, 1.30, 0.86, 'OpenGameArt sfx_loops water_boiling.ogg + StarNinjas fire_loop.wav + Castle Boiling Oil mastering (CC0 1.0)'),

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

    # Distinct War Horns (Royal / Enemy Warlord / Allied Commander) & Medieval Unit Acknowledgments
    ('horn', 'voice', 'horn_war.ogg', False, False, 0.0, 2.0, 0.66, 'OpenGameArt - Their Coming war horn (theircoming.ogg, CC0 1.0)'),
    ('horn-enemy', 'voice', 'recipe:horn-enemy', False, False, 0.0, 2.15, 0.82, 'OpenGameArt - Deep Siege War Horn (horn_war3.ogg) + Dark War Drum mastering (CC0 1.0)'),
    ('horn-ally', 'voice', 'recipe:horn-ally', False, False, 0.0, 1.40, 0.78, 'OpenGameArt - War Horn (horn_war.ogg) + Noble Allied Rising Brass Call mastering (CC0 1.0)'),
    ('voice-select', 'voice', 'recipe:voice-select', False, False, 0.0, 0.76, 0.82, 'Kenney Voiceover Pack (Male/ready.ogg, baritone armored mastering) + RPG Sound Pack chainmail1.wav (CC0 1.0)'),
    ('voice-order', 'voice', 'recipe:voice-order', False, False, 0.0, 0.66, 0.82, 'Kenney Voiceover Pack (Male/go.ogg, baritone armored mastering) + RPG Sound Pack armor-light.wav (CC0 1.0)'),
    ('voice-attack', 'voice', 'recipe:voice-attack', False, False, 0.0, 0.90, 0.85, 'HaelDB Male Grunt/Yelling (1yell4.wav, armored baritone battle cry) + sword-unsheathe.wav + War Drum mastering (CC0 1.0)'),
    ('voice-work', 'voice', 'recipe:voice-work', False, False, 0.0, 0.44, 0.78, 'Kenney - 50 RPG sound effects (beltHandle2.ogg, chop.ogg, craftsman mastering, CC0 1.0)'),
    ('unit-cavalry', 'voice', 'recipe:unit-cavalry', False, False, 0.0, 0.52, 0.80, 'KobatoGames horse_trot.ogg + Kenney beltHandle1.ogg (Cavalry acknowledgment mastering, CC0 1.0)'),
    ('unit-archer', 'voice', 'recipe:unit-archer', False, False, 0.0, 0.45, 0.80, 'remaxim Bow.wav + Kenney cloth1.ogg (Archer draw acknowledgment mastering, CC0 1.0)'),
    ('unit-healer', 'voice', 'recipe:unit-healer', False, False, 0.0, 0.76, 0.76, 'Crowns of the Frontier Studio Mastering - Monastery Sanctuary Bell Chord (CC0 1.0)'),
    ('unit-hero', 'voice', 'recipe:unit-hero', False, False, 0.0, 0.96, 0.85, 'Kenney Fighter Voiceover (fight.ogg, deep heroic baritone) + sword-unsheathe2.wav + Royal Brass mastering (CC0 1.0)'),
    ('unit-hold', 'voice', 'recipe:unit-hold', False, False, 0.0, 0.64, 0.82, 'Kenney Voiceover Pack (Male/hold.ogg, baritone armored mastering) + RPG Sound Pack interface1.wav (CC0 1.0)'),

    # Real Human Recorded CC0 Commander, Herald & Battle Alert Voices (replaces robotic browser TTS!)
    ('comms-alert', 'voice', 'recipe:comms-alert', False, False, 0.0, 0.78, 0.85, 'Kenney Voiceover Pack (Male/war_look_out.ogg, urgent watchtower herald baritone, CC0 1.0)'),
    ('comms-begin', 'voice', 'recipe:comms-begin', False, False, 0.0, 1.18, 0.84, 'Kenney Fighter Voiceover (begin.ogg, deep royal herald baritone mastering, CC0 1.0)'),
    ('comms-enemy', 'voice', 'recipe:comms-enemy', False, False, 0.0, 1.72, 0.85, 'Kenney Fighter Voiceover (prepare_yourself.ogg, gravelly deep male warlord mastering, CC0 1.0)'),
    ('comms-ally', 'voice', 'recipe:comms-ally', False, False, 0.0, 0.98, 0.84, 'Kenney Fighter Voiceover (ready.ogg, noble allied commander baritone mastering, CC0 1.0)'),
    ('comms-ally-attack', 'voice', 'recipe:comms-ally-attack', False, False, 0.0, 1.05, 0.85, 'Kenney Voiceover Pack (Male/war_go_go_go.ogg, baritone battle commander) + sword-unsheathe.wav (CC0 1.0)'),
    ('comms-ally-hold', 'voice', 'recipe:comms-ally-hold', False, False, 0.0, 0.72, 0.84, 'Kenney Voiceover Pack (Male/hold.ogg, commanding shield-wall baritone mastering, CC0 1.0)'),
    ('comms-ally-help', 'voice', 'recipe:comms-ally-help', False, False, 0.0, 1.12, 0.85, 'Kenney Voiceover Pack (Male/war_call_for_backup.ogg, urgent baritone allied SOS mastering, CC0 1.0)'),
    ('comms-objective', 'voice', 'recipe:comms-objective', False, False, 0.0, 1.50, 0.84, 'Kenney Voiceover Pack (Male/objective_achieved.ogg, noble herald baritone) + Bell Chime mastering (CC0 1.0)'),
    ('comms-female', 'voice', 'recipe:comms-female', False, False, 0.0, 0.64, 0.82, 'Kenney Voiceover Pack (Female/ready.ogg by Giselle, warm regal commander mastering, CC0 1.0)'),
    ('grunt-0', 'voice', 'hit_dying/ogg/hit1.ogg', False, False, 0.0, 0.70, 0.80, 'alket - 5 Hit Sounds + Dying (hit1.ogg, CC0 1.0)'),
    ('grunt-1', 'voice', 'hit_dying/ogg/hit3.ogg', False, False, 0.0, 0.70, 0.80, 'alket - 5 Hit Sounds + Dying (hit3.ogg, CC0 1.0)'),
    ('grunt-2', 'voice', 'hit_dying/ogg/die1.ogg', False, False, 0.0, 0.90, 0.80, 'alket - 5 Hit Sounds + Dying (die1.ogg, CC0 1.0)'),

    # Seamless Crossfaded Weather & Biome Ambience Field Recordings
    ('rain', 'weather', 'rain_ogg/1.ogg', True, False, 0.5, 10.0, 0.70, 'Snabisch - Rain loopable (1.ogg, CC0 1.0)'),
    ('amb-meadow', 'weather', 'birds_meadow.ogg', True, False, 0.5, 11.0, 0.72, 'Isaiah658 - Ambient Bird Sounds (birds-isaiah658.ogg, CC0 1.0)'),
    ('amb-coast', 'weather', 'ocean_wave_prev.ogg', True, False, 0.4, 10.0, 0.72, 'Jasinski - Beach Ocean Waves (CC0 1.0)'),
    ('amb-river', 'weather', 'water_wave_prev.ogg', True, False, 0.4, 7.536, 0.70, 'Transitking - Water Waves / River (CC0 1.0)'),
    ('amb-tundra', 'weather', 'wind_loop.ogg', True, False, 0.2, 9.5, 0.72, 'WolfTech - Wind (Wind.ogg, CC0 1.0)'),
    ('amb-arid', 'weather', 'wind1.wav', True, False, 0.5, 9.5, 0.68, 'qubodup - Wind field recording (wind1.wav, CC0 1.0)'),
    ('amb-volcanic', 'weather', 'dungeon_rumble.ogg', True, False, 0.5, 10.5, 0.72, 'IgnasD - Loopable Dungeon Ambience rumble (dungeon_ambient_1.ogg, CC0 1.0)'),

    # Adaptive 4-Tier Real Medieval Music Stems + Exploration Pad (seamless crossfaded loops!)
    ('pad', 'music', 'music_peace_bard.mp3', True, True, 2.0, 22.0, 0.72, 'RandomMind / Flixberry - Medieval: The Bard Tale (CC0 1.0)'),
    ('music-peace', 'music', 'music_peace_inn.mp3', True, True, 1.0, 24.0, 0.74, 'RandomMind / AntumDeluge - Medieval: The Old Tower Inn (CC0 1.0)'),
    ('music-tension', 'music', 'music_tension_lament.mp3', True, True, 2.0, 24.0, 0.74, 'RandomMind / Snabisch - Fantasy: Lament for a Warriors Soul (CC0 1.0)'),
    ('music-battle', 'music', 'recipe:music-battle', True, True, 0.0, 24.0, 0.78, 'Crowns of the Frontier Medieval Battle Score + Snabisch Fantasy Choir & OpenGameArt War Horn mastering (CC0 1.0)'),
    ('music-climax', 'music', 'music_climax_choir.mp3', True, True, 1.0, 22.0, 0.78, 'Snabisch - Fantasy Choir 1 (CC0 1.0)'),
]


def load_pcm(src_path: Path, stereo: bool = False) -> np.ndarray:
    s = aud.Sound(str(src_path))
    s = s.resample(RATE, False)
    s = s.rechannel(2 if stereo else 1)
    data = np.asarray(s.data(), dtype=np.float32)
    if data.ndim == 1:
        data = data[:, None]
    return data


def load_mono(rel_path: str) -> np.ndarray:
    src = SRC_DIR / rel_path
    if not src.is_file():
        raise FileNotFoundError(f'Missing CC0 source: {src}')
    return load_pcm(src, False)[:, 0]


def trim_silence_1d(sig: np.ndarray, thresh: float = 0.008) -> np.ndarray:
    active = np.flatnonzero(np.abs(sig) > thresh)
    if len(active) < 64:
        return sig
    lead = max(0, int(active[0]) - int(0.005 * RATE))
    tail = min(len(sig), int(active[-1]) + int(0.045 * RATE))
    return sig[lead:tail]


def resample_pitch(sig: np.ndarray, factor: float) -> np.ndarray:
    """Clean linear pitch shift: factor < 1 deepens pitch, factor > 1 raises pitch."""
    if abs(factor - 1.0) < 1e-4:
        return sig.copy()
    n_out = max(16, int(round(len(sig) / factor)))
    x_old = np.arange(len(sig), dtype=np.float64)
    x_new = np.linspace(0.0, len(sig) - 1.0, n_out, dtype=np.float64)
    return np.interp(x_new, x_old, sig.astype(np.float64)).astype(np.float32)


def fft_eq(sig: np.ndarray, hp=None, lp=None, bands=()) -> np.ndarray:
    """Zero-phase studio FFT equalizer with smooth Butterworth-like slopes and bell bands."""
    n = len(sig)
    nfft = 1 << int(math.ceil(math.log2(max(256, n + 2048))))
    spec = np.fft.rfft(sig.astype(np.float64), n=nfft)
    freqs = np.fft.rfftfreq(nfft, d=1.0 / RATE)
    gain = np.ones_like(freqs)
    if hp is not None and hp > 1.0:
        gain *= 1.0 / np.sqrt(1.0 + (hp / np.maximum(freqs, 1e-3)) ** 4)
    if lp is not None and lp > 1.0:
        gain *= 1.0 / np.sqrt(1.0 + (freqs / lp) ** 4)
    for center, db, q in bands:
        lin = 10.0 ** (db / 20.0)
        bw = max(25.0, center / max(0.3, q))
        bell = np.exp(-0.5 * ((freqs - center) / bw) ** 2)
        gain *= 1.0 + (lin - 1.0) * bell
    out = np.fft.irfft(spec * gain, n=nfft)[:n]
    return out.astype(np.float32)


def courtyard_reverb(sig: np.ndarray, wet: float = 0.20, decay_sec: float = 0.45, tail_extra: float = 0.32) -> np.ndarray:
    """Open-air stone courtyard / castle hall convolution reverb with warm early reflections."""
    ir_len = max(512, int(decay_sec * RATE))
    rng = np.random.default_rng(202605)
    t = np.linspace(0.0, 1.0, ir_len, dtype=np.float64)
    noise = rng.standard_normal(ir_len)
    tail = fft_eq(noise.astype(np.float32), hp=120.0, lp=2600.0).astype(np.float64)
    ir = tail * np.exp(-t * 4.8) * 0.24
    for ms, amp in [(11, 0.48), (23, -0.34), (39, 0.25), (61, -0.17), (89, 0.11)]:
        idx = int((ms / 1000.0) * RATE)
        if idx < ir_len:
            ir[idx] += amp
    ir[0] = 0.0
    out_len = len(sig) + int(tail_extra * RATE)
    nfft = 1 << int(math.ceil(math.log2(out_len + ir_len)))
    wet_sig = np.fft.irfft(np.fft.rfft(sig.astype(np.float64), n=nfft) * np.fft.rfft(ir, n=nfft), n=nfft)[:out_len]
    dry = np.zeros(out_len, dtype=np.float64)
    dry[:len(sig)] = sig
    return (dry * (1.0 - wet * 0.22) + wet_sig * wet).astype(np.float32)


def soft_saturate(sig: np.ndarray, drive: float = 1.18) -> np.ndarray:
    if drive <= 1.0:
        return sig
    return (np.tanh(sig * drive) / math.tanh(drive)).astype(np.float32)


def mix_into(dest: np.ndarray, src: np.ndarray, start_sec: float, gain: float = 1.0) -> None:
    s = int(round(start_sec * RATE))
    if s >= len(dest):
        return
    if s < 0:
        src = src[-s:]
        s = 0
    n = min(len(src), len(dest) - s)
    if n > 0:
        dest[s:s + n] += src[:n] * gain


def fade_edges(sig: np.ndarray, fi_sec: float = 0.004, fo_sec: float = 0.035) -> np.ndarray:
    out = sig.copy()
    fi = min(int(fi_sec * RATE), len(out) // 3)
    fo = min(int(fo_sec * RATE), len(out) // 2)
    if fi > 1:
        out[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)
    if fo > 1:
        out[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)
    return out


def peak_unit(sig: np.ndarray) -> np.ndarray:
    p = float(np.max(np.abs(sig)))
    return sig / p if p > 1e-6 else sig


def cast_iron_bell(base_freq: float, dur: float) -> np.ndarray:
    """Physically modeled medieval cast-iron/bronze watchtower bell using true campanology partials."""
    n = int(dur * RATE)
    t = np.arange(n, dtype=np.float64) / RATE
    out = np.zeros(n, dtype=np.float64)
    partials = [
        (0.500, 0.34, 0.92, 0.45),
        (1.000, 0.56, 0.70, 0.90),
        (1.183, 0.42, 0.52, 1.35),
        (1.506, 0.28, 0.38, 1.70),
        (2.000, 0.48, 0.34, 1.15),
        (2.514, 0.18, 0.20, 2.20),
        (2.996, 0.22, 0.18, 2.60),
        (4.020, 0.12, 0.11, 3.10),
    ]
    attack = np.minimum(1.0, t / 0.004)
    for ratio, amp, decay, beat_hz in partials:
        f = base_freq * ratio
        if f >= RATE * 0.44:
            continue
        env = np.exp(-t / decay) * attack
        wave = 0.62 * np.sin(TAU * f * t) + 0.38 * np.sin(TAU * (f + beat_hz) * t + 0.4)
        out += wave * amp * env
    rng = np.random.default_rng(int(base_freq * 10))
    clapper = fft_eq(rng.standard_normal(n).astype(np.float32), hp=1600.0, lp=6200.0)
    out += clapper * np.exp(-t / 0.012) * 0.42
    return fade_edges(out.astype(np.float32), 0.002, 0.08)


def medieval_brass(freqs, dur: float, attack_sec: float = 0.11, release_sec: float = 0.28) -> np.ndarray:
    """Warm orchestral French horn / herald brass chord with lip-swell onset & 3-player chorus."""
    n = int(dur * RATE)
    t = np.arange(n, dtype=np.float64) / RATE
    out = np.zeros(n, dtype=np.float64)
    att = np.minimum(1.0, t / max(0.015, attack_sec))
    rel = np.minimum(1.0, np.maximum(0.0, (dur - t) / max(0.04, release_sec)))
    env = (att ** 0.85) * (rel ** 1.15)
    bend = 1.0 - 0.018 * np.exp(-t / 0.075)
    for idx, f0 in enumerate(freqs):
        for detune, weight in [(-0.0032, 0.30), (0.0, 0.46), (0.0035, 0.30)]:
            phase = TAU * f0 * (1.0 + detune) * np.cumsum(bend) / RATE
            vib = 0.0035 * np.sin(TAU * (4.6 + idx * 0.2) * t) * np.minimum(1.0, t / 0.35)
            voice = np.zeros(n, dtype=np.float64)
            for h, hamp in [(1, 0.46), (2, 0.36), (3, 0.24), (4, 0.14), (5, 0.08), (6, 0.04)]:
                if f0 * h < RATE * 0.42:
                    voice += np.sin(phase * h + vib * h) * hamp
            out += voice * weight / max(1, len(freqs))
    out *= env
    return fft_eq(soft_saturate(out.astype(np.float32), 1.25), hp=75.0, lp=2900.0, bands=[(420, 2.5, 1.1)])


def war_drum(base_freq: float = 70.0, dur: float = 0.42, seed: int = 77) -> np.ndarray:
    """Deep medieval timpani / siege frame drum with authentic pitch-drop skin transient."""
    n = int(dur * RATE)
    t = np.arange(n, dtype=np.float64) / RATE
    freq = base_freq * (1.0 + 0.42 * np.exp(-t / 0.032))
    phase = TAU * np.cumsum(freq) / RATE
    body = np.sin(phase) * np.exp(-t / 0.13) + 0.35 * np.sin(phase * 1.54) * np.exp(-t / 0.065)
    rng = np.random.default_rng(seed)
    beater = fft_eq(rng.standard_normal(n).astype(np.float32), hp=90.0, lp=950.0)
    skin = beater * np.exp(-t / 0.018) * 0.45
    return fade_edges((body * 0.85 + skin).astype(np.float32), 0.002, 0.04)


def plucked_harp(freq: float, dur: float, seed: int = 101, damping: float = 0.9955) -> np.ndarray:
    """Warm Karplus-Strong medieval harp/lute string with wooden body resonance."""
    n = int(dur * RATE)
    period = max(8, int(round(RATE / freq)))
    rng = np.random.default_rng(seed)
    ring = (rng.uniform(-1.0, 1.0, period) * 0.52 + np.sin(TAU * np.arange(period) / period) * 0.48).astype(np.float64)
    out = np.zeros(n, dtype=np.float64)
    prev = float(ring[-1])
    idx = 0
    for i in range(n):
        cur = ring[idx]
        nxt = 0.5 * (cur + prev) * damping
        prev = cur
        ring[idx] = nxt
        out[i] = cur
        idx += 1
        if idx == period:
            idx = 0
    return fft_eq(fade_edges(out.astype(np.float32), 0.002, 0.06), hp=110.0, lp=4800.0, bands=[(340, 2.5, 1.0)])


def peak_window(sig: np.ndarray, dur: float, start_frac: float = 0.45, end_frac: float = 0.96) -> np.ndarray:
    """Extract the most dramatic high-energy musical window from a longer CC0 orchestral recording."""
    want = min(len(sig), int(dur * RATE))
    lo = int(len(sig) * start_frac)
    hi = max(lo + 1, int(len(sig) * end_frac) - want)
    best_i, best_rms = lo, -1.0
    step = int(0.35 * RATE)
    for i in range(lo, hi, step):
        seg = sig[i:i + want]
        rms = float(np.sqrt(np.mean(seg * seg)))
        if rms > best_rms:
            best_rms = rms
            best_i = i
    return sig[best_i:best_i + want].copy()


def build_recipe(name: str) -> np.ndarray:
    if name == 'alarm':
        out = np.zeros(int(1.80 * RATE), dtype=np.float32)
        bell1 = peak_unit(cast_iron_bell(293.66, 1.15))
        bell2 = peak_unit(cast_iron_bell(293.66, 1.25))
        ring = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/metal-ringing.wav')))
        ring = fft_eq(ring[:int(0.45 * RATE)], hp=600.0, lp=4200.0)
        horn_raw = peak_unit(trim_silence_1d(load_mono('horn_war3.ogg')))
        horn_seg = fade_edges(fft_eq(horn_raw[:int(1.25 * RATE)], hp=85.0, lp=2200.0, bands=[(210, 3.0, 1.0)]), 0.06, 0.24)
        drum = peak_unit(war_drum(68.0, 0.36, seed=19))
        mix_into(out, bell1, 0.00, 0.68)
        mix_into(out, ring, 0.00, 0.24)
        mix_into(out, drum, 0.00, 0.42)
        mix_into(out, horn_seg, 0.14, 0.56)
        mix_into(out, bell2, 0.44, 0.72)
        mix_into(out, ring, 0.44, 0.20)
        mix_into(out, drum, 0.44, 0.38)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.50, tail_extra=0.05), 1.14), 0.003, 0.09)

    if name == 'complete':
        out = np.zeros(int(1.20 * RATE), dtype=np.float32)
        for i, freq in enumerate([293.66, 369.99, 440.00, 587.33]):
            h = peak_unit(plucked_harp(freq, 0.85, seed=210 + i))
            mix_into(out, h, i * 0.085, 0.52 - i * 0.04)
        brass = peak_unit(medieval_brass([293.66, 440.00], 0.88, attack_sec=0.14, release_sec=0.35))
        mix_into(out, brass, 0.06, 0.26)
        click = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/metalClick.ogg')))
        mix_into(out, click[:int(0.18 * RATE)], 0.25, 0.14)
        return fade_edges(courtyard_reverb(out, wet=0.20, decay_sec=0.45, tail_extra=0.05), 0.003, 0.08)

    if name == 'victory':
        out = np.zeros(int(2.80 * RATE), dtype=np.float32)
        choir = load_mono('music_climax_choir.mp3')
        climax = peak_unit(fade_edges(peak_window(choir, 2.55, 0.55, 0.98), 0.12, 0.55))
        fanfare1 = peak_unit(medieval_brass([293.66, 440.00], 0.42, attack_sec=0.05, release_sec=0.12))
        fanfare2 = peak_unit(medieval_brass([369.99, 440.00, 587.33], 1.75, attack_sec=0.12, release_sec=0.55))
        drum1 = peak_unit(war_drum(73.42, 0.45, seed=31))
        drum2 = peak_unit(war_drum(73.42, 0.55, seed=33))
        mix_into(out, drum1, 0.00, 0.40)
        mix_into(out, fanfare1, 0.02, 0.46)
        mix_into(out, drum2, 0.32, 0.48)
        mix_into(out, fanfare2, 0.34, 0.54)
        mix_into(out, climax, 0.14, 0.72)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.60, tail_extra=0.05), 1.15), 0.006, 0.18)

    if name == 'defeat':
        out = np.zeros(int(2.60 * RATE), dtype=np.float32)
        lament = load_mono('music_tension_lament.mp3')
        seg = peak_unit(fade_edges(lament[int(0.4 * RATE):int(2.85 * RATE)], 0.10, 0.65))
        low_horn1 = peak_unit(medieval_brass([174.61, 220.00], 0.95, attack_sec=0.16, release_sec=0.35))
        low_horn2 = peak_unit(medieval_brass([146.83, 174.61], 1.35, attack_sec=0.20, release_sec=0.60))
        drum = peak_unit(war_drum(58.27, 0.55, seed=41))
        mix_into(out, drum, 0.00, 0.44)
        mix_into(out, seg, 0.04, 0.72)
        mix_into(out, low_horn1, 0.18, 0.34)
        mix_into(out, low_horn2, 1.05, 0.38)
        return fade_edges(fft_eq(courtyard_reverb(out, wet=0.26, decay_sec=0.65, tail_extra=0.05), hp=55.0, lp=4200.0), 0.008, 0.22)

    if name == 'age-up':
        out = np.zeros(int(2.20 * RATE), dtype=np.float32)
        choir = load_mono('music_climax_choir.mp3')
        swell = peak_unit(fade_edges(peak_window(choir, 1.85, 0.50, 0.95), 0.16, 0.48))
        call1 = peak_unit(medieval_brass([293.66, 440.00], 0.32, attack_sec=0.04, release_sec=0.08))
        call2 = peak_unit(medieval_brass([440.00, 587.33], 0.32, attack_sec=0.04, release_sec=0.08))
        chord = peak_unit(medieval_brass([293.66, 369.99, 440.00, 587.33], 1.45, attack_sec=0.10, release_sec=0.50))
        drum = peak_unit(war_drum(73.42, 0.44, seed=51))
        mix_into(out, drum, 0.00, 0.34)
        mix_into(out, call1, 0.00, 0.44)
        mix_into(out, call2, 0.26, 0.46)
        mix_into(out, drum, 0.52, 0.44)
        mix_into(out, chord, 0.52, 0.58)
        mix_into(out, swell, 0.30, 0.56)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.55, tail_extra=0.05), 1.14), 0.004, 0.14)

    if name == 'horn-enemy':
        out = np.zeros(int(2.10 * RATE), dtype=np.float32)
        raw = peak_unit(trim_silence_1d(load_mono('horn_war3.ogg')))
        deep = fft_eq(resample_pitch(raw, 0.94)[:int(1.95 * RATE)], hp=60.0, lp=2100.0, bands=[(135, 3.5, 0.9), (900, -2.5, 1.2)])
        drum = peak_unit(war_drum(58.0, 0.48, seed=61))
        mix_into(out, drum, 0.00, 0.48)
        mix_into(out, fade_edges(deep, 0.04, 0.25), 0.03, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.24, decay_sec=0.55, tail_extra=0.05), 1.18), 0.005, 0.12)

    if name == 'horn-ally':
        out = np.zeros(int(1.36 * RATE), dtype=np.float32)
        raw = peak_unit(trim_silence_1d(load_mono('horn_war.ogg')))
        tex1 = fade_edges(fft_eq(resample_pitch(raw[:int(0.55 * RATE)], 1.12), hp=140.0, lp=2200.0), 0.04, 0.14)
        tex2 = fade_edges(fft_eq(resample_pitch(raw[:int(0.85 * RATE)], 1.335), hp=160.0, lp=2400.0), 0.06, 0.22)
        b1 = peak_unit(medieval_brass([220.00, 329.63], 0.36, attack_sec=0.06, release_sec=0.10))
        b2 = peak_unit(medieval_brass([293.66, 440.00], 0.95, attack_sec=0.08, release_sec=0.36))
        mix_into(out, tex1, 0.00, 0.34)
        mix_into(out, b1, 0.00, 0.56)
        mix_into(out, tex2, 0.30, 0.38)
        mix_into(out, b2, 0.30, 0.68)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.45, tail_extra=0.04), 1.12), 0.004, 0.10)

    if name == 'chat-all':
        out = np.zeros(int(0.40 * RATE), dtype=np.float32)
        page = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/bookFlip1.ogg')))
        page = fft_eq(page[:int(0.22 * RATE)], hp=300.0, lp=4800.0)
        chime = peak_unit(fft_eq(cast_iron_bell(880.0, 0.36), hp=350.0, lp=5200.0))
        mix_into(out, page, 0.00, 0.52)
        mix_into(out, chime, 0.03, 0.42)
        return fade_edges(out, 0.003, 0.06)

    if name == 'chat-team':
        out = np.zeros(int(0.50 * RATE), dtype=np.float32)
        page = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/bookFlip1.ogg')))
        page = fft_eq(page[:int(0.18 * RATE)], hp=350.0, lp=4600.0)
        c1 = peak_unit(fft_eq(cast_iron_bell(659.25, 0.28), hp=320.0, lp=5200.0))
        c2 = peak_unit(fft_eq(cast_iron_bell(987.77, 0.36), hp=380.0, lp=5800.0))
        mix_into(out, page, 0.00, 0.36)
        mix_into(out, c1, 0.02, 0.52)
        mix_into(out, c2, 0.12, 0.60)
        return fade_edges(courtyard_reverb(out, wet=0.14, decay_sec=0.30, tail_extra=0.02), 0.003, 0.06)

    if name == 'flare':
        out = np.zeros(int(0.70 * RATE), dtype=np.float32)
        ring = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/metal-ringing.wav')))
        ring = fft_eq(ring[:int(0.32 * RATE)], hp=900.0, lp=6000.0)
        p1 = peak_unit(fft_eq(cast_iron_bell(783.99, 0.36), hp=420.0, lp=6200.0))
        p2 = peak_unit(fft_eq(cast_iron_bell(1174.66, 0.52), hp=520.0, lp=6800.0))
        mix_into(out, ring, 0.00, 0.26)
        mix_into(out, p1, 0.00, 0.54)
        mix_into(out, p2, 0.13, 0.66)
        return fade_edges(courtyard_reverb(out, wet=0.18, decay_sec=0.38, tail_extra=0.02), 0.002, 0.08)

    if name == 'tribute':
        out = np.zeros(int(0.80 * RATE), dtype=np.float32)
        coins1 = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/handleCoins2.ogg')))
        coins2 = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/coin.wav')))
        h1 = peak_unit(plucked_harp(293.66, 0.62, seed=401))
        h2 = peak_unit(plucked_harp(440.00, 0.62, seed=402))
        h3 = peak_unit(plucked_harp(587.33, 0.62, seed=403))
        mix_into(out, coins1[:int(0.55 * RATE)], 0.00, 0.52)
        mix_into(out, coins2[:int(0.45 * RATE)], 0.08, 0.44)
        mix_into(out, h1, 0.06, 0.34)
        mix_into(out, h2, 0.13, 0.34)
        mix_into(out, h3, 0.20, 0.32)
        return fade_edges(courtyard_reverb(out, wet=0.18, decay_sec=0.38, tail_extra=0.02), 0.003, 0.08)

    if name == 'notice-warn':
        out = np.zeros(int(0.26 * RATE), dtype=np.float32)
        thud = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/interface/interface6.wav')))
        warm = fft_eq(thud[:int(0.14 * RATE)], hp=65.0, lp=1250.0, bands=[(180, 3.0, 1.0)])
        mix_into(out, warm, 0.00, 0.62)
        mix_into(out, resample_pitch(warm, 0.88), 0.095, 0.54)
        return fade_edges(out, 0.003, 0.04)

    if name == 'voice-select':
        out = np.zeros(int(0.74 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/ready.ogg')))
        vox = resample_pitch(vox, 0.93)
        vox = fft_eq(vox, hp=95.0, lp=5800.0, bands=[(210, 3.2, 1.1), (1800, 1.5, 1.2), (4400, -4.5, 1.6)])
        mail = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/chainmail1.wav')))
        mail = fft_eq(mail[:int(0.32 * RATE)], hp=400.0, lp=5200.0)
        mix_into(out, mail, 0.00, 0.24)
        mix_into(out, fade_edges(vox, 0.004, 0.04), 0.03, 0.82)
        return fade_edges(courtyard_reverb(out, wet=0.14, decay_sec=0.30, tail_extra=0.02), 0.003, 0.05)

    if name == 'voice-order':
        out = np.zeros(int(0.64 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/go.ogg')))
        vox = resample_pitch(vox, 0.92)
        vox = fft_eq(vox, hp=95.0, lp=5400.0, bands=[(200, 3.4, 1.1), (1850, 1.6, 1.2), (4300, -4.5, 1.6)])
        armor = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/armor-light.wav')))
        step1 = peak_unit(war_drum(94.0, 0.14, seed=81))
        mix_into(out, fft_eq(armor[:int(0.24 * RATE)], hp=180.0, lp=4400.0), 0.00, 0.34)
        mix_into(out, step1, 0.01, 0.24)
        mix_into(out, fade_edges(vox, 0.004, 0.045), 0.025, 0.86)
        return fade_edges(courtyard_reverb(out, wet=0.14, decay_sec=0.28, tail_extra=0.02), 0.003, 0.05)

    if name == 'voice-attack':
        out = np.zeros(int(0.88 * RATE), dtype=np.float32)
        yell = peak_unit(trim_silence_1d(load_mono('male_yells_cc0/yelling sounds/1yell4.wav')))
        yell = resample_pitch(yell, 0.92)
        yell = fft_eq(yell, hp=105.0, lp=5000.0, bands=[(210, 3.2, 1.1), (1600, 1.8, 1.2), (4200, -4.0, 1.6)])
        steel = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/battle/sword-unsheathe.wav')))
        steel = fft_eq(steel[:int(0.38 * RATE)], hp=360.0, lp=7400.0)
        drum = peak_unit(war_drum(78.0, 0.28, seed=91))
        mix_into(out, steel, 0.00, 0.56)
        mix_into(out, drum, 0.02, 0.42)
        mix_into(out, fade_edges(yell, 0.006, 0.06), 0.045, 0.82)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.38, tail_extra=0.02), 1.10), 0.002, 0.07)

    if name == 'voice-work':
        out = np.zeros(int(0.42 * RATE), dtype=np.float32)
        belt = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/beltHandle2.ogg')))
        wood = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/chop.ogg')))
        wood = fft_eq(wood[:int(0.18 * RATE)], hp=120.0, lp=2400.0)
        mix_into(out, fft_eq(belt[:int(0.28 * RATE)], hp=160.0, lp=4600.0), 0.00, 0.62)
        mix_into(out, wood, 0.09, 0.46)
        return fade_edges(courtyard_reverb(out, wet=0.10, decay_sec=0.22, tail_extra=0.02), 0.003, 0.05)

    if name == 'unit-cavalry':
        out = np.zeros(int(0.50 * RATE), dtype=np.float32)
        trot = peak_unit(trim_silence_1d(load_mono('horse_trot.ogg')))
        bridle = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/beltHandle1.ogg')))
        mix_into(out, fade_edges(fft_eq(trot[:int(0.44 * RATE)], hp=90.0, lp=3600.0), 0.005, 0.08), 0.00, 0.74)
        mix_into(out, fft_eq(bridle[:int(0.24 * RATE)], hp=280.0, lp=5200.0), 0.03, 0.42)
        return fade_edges(courtyard_reverb(out, wet=0.12, decay_sec=0.25, tail_extra=0.02), 0.003, 0.05)

    if name == 'unit-archer':
        out = np.zeros(int(0.44 * RATE), dtype=np.float32)
        bow = peak_unit(trim_silence_1d(load_mono('battle_sfx/battle_sound_effects/Bow.wav')))
        cloth = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/cloth1.ogg')))
        mix_into(out, fft_eq(cloth[:int(0.22 * RATE)], hp=400.0, lp=4800.0), 0.00, 0.36)
        mix_into(out, fft_eq(bow[:int(0.36 * RATE)], hp=140.0, lp=5400.0), 0.03, 0.78)
        return fade_edges(courtyard_reverb(out, wet=0.12, decay_sec=0.24, tail_extra=0.02), 0.003, 0.05)

    if name == 'unit-healer':
        out = np.zeros(int(0.74 * RATE), dtype=np.float32)
        n = len(out)
        t = np.arange(n, dtype=np.float64) / RATE
        env = np.minimum(1.0, t / 0.035) * np.exp(-t / 0.28)
        chord = np.zeros(n, dtype=np.float64)
        for f, amp in [(587.33, 0.46), (880.00, 0.34), (1174.66, 0.22), (1479.98, 0.14)]:
            chord += (0.65 * np.sin(TAU * f * t) + 0.35 * np.sin(TAU * (f + 1.4) * t)) * amp
        out += (chord * env).astype(np.float32)
        return fade_edges(courtyard_reverb(out, wet=0.24, decay_sec=0.48, tail_extra=0.02), 0.005, 0.09)

    if name == 'unit-hero':
        out = np.zeros(int(0.94 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_fighter/Audio/fight.ogg')))
        vox = resample_pitch(vox, 0.90)
        vox = fft_eq(vox, hp=95.0, lp=4400.0, bands=[(185, 4.2, 1.1), (1500, 1.4, 1.2), (3800, -5.0, 1.4)])
        steel = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/battle/sword-unsheathe2.wav')))
        brass = peak_unit(medieval_brass([146.83, 220.00, 293.66], 0.72, attack_sec=0.09, release_sec=0.28))
        mix_into(out, fft_eq(steel[:int(0.38 * RATE)], hp=320.0, lp=7200.0), 0.00, 0.48)
        mix_into(out, brass, 0.05, 0.38)
        mix_into(out, fade_edges(vox, 0.005, 0.05), 0.04, 0.84)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.20, decay_sec=0.40, tail_extra=0.02), 1.08), 0.003, 0.07)

    if name == 'unit-hold':
        out = np.zeros(int(0.62 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/hold.ogg')))
        vox = resample_pitch(vox, 0.92)
        vox = fft_eq(vox, hp=95.0, lp=5600.0, bands=[(200, 3.4, 1.1), (4200, -4.5, 1.6)])
        shield = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/interface/interface1.wav')))
        shield = fft_eq(shield[:int(0.24 * RATE)], hp=90.0, lp=2600.0)
        mix_into(out, shield, 0.00, 0.42)
        mix_into(out, fade_edges(vox, 0.004, 0.04), 0.03, 0.80)
        return fade_edges(courtyard_reverb(out, wet=0.14, decay_sec=0.30, tail_extra=0.02), 0.003, 0.05)

    if name == 'comms-alert':
        out = np.zeros(int(0.76 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/war_look_out.ogg')))
        vox = resample_pitch(vox, 0.90)
        vox = fft_eq(vox, hp=95.0, lp=5400.0, bands=[(195, 3.6, 1.1), (1900, 1.8, 1.2), (4400, -4.5, 1.5)])
        bell = peak_unit(fft_eq(cast_iron_bell(587.33, 0.42), hp=280.0, lp=4200.0))
        mix_into(out, bell, 0.00, 0.24)
        mix_into(out, fade_edges(vox, 0.004, 0.05), 0.035, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.34, tail_extra=0.02), 1.06), 0.003, 0.06)

    if name == 'comms-begin':
        out = np.zeros(int(1.16 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_fighter/Audio/begin.ogg')))
        vox = resample_pitch(vox, 0.90)
        vox = fft_eq(vox, hp=85.0, lp=4400.0, bands=[(180, 4.4, 1.1), (1450, 1.2, 1.2), (3800, -5.5, 1.4)])
        mix_into(out, fade_edges(vox, 0.005, 0.06), 0.02, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.44, tail_extra=0.02), 1.06), 0.003, 0.07)

    if name == 'comms-enemy':
        out = np.zeros(int(1.70 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_fighter/Audio/prepare_yourself.ogg')))
        vox = resample_pitch(vox, 0.87)
        vox = fft_eq(vox, hp=80.0, lp=4100.0, bands=[(165, 4.8, 1.1), (1350, 1.2, 1.2), (3500, -6.0, 1.4)])
        drum = peak_unit(war_drum(68.0, 0.36, seed=711))
        mix_into(out, drum, 0.00, 0.30)
        mix_into(out, fade_edges(vox, 0.005, 0.07), 0.03, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.24, decay_sec=0.48, tail_extra=0.02), 1.08), 0.003, 0.08)

    if name == 'comms-ally':
        out = np.zeros(int(0.96 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_fighter/Audio/ready.ogg')))
        vox = resample_pitch(vox, 0.92)
        vox = fft_eq(vox, hp=90.0, lp=4500.0, bands=[(190, 4.0, 1.1), (1600, 1.4, 1.2), (3900, -5.0, 1.4)])
        mix_into(out, fade_edges(vox, 0.005, 0.05), 0.02, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.02), 1.06), 0.003, 0.06)

    if name == 'comms-ally-attack':
        out = np.zeros(int(1.04 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/war_go_go_go.ogg')))
        vox = resample_pitch(vox, 0.91)
        vox = fft_eq(vox, hp=95.0, lp=5400.0, bands=[(200, 3.6, 1.1), (1850, 1.6, 1.2), (4400, -4.5, 1.5)])
        steel = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/battle/sword-unsheathe.wav')))
        mix_into(out, fft_eq(steel[:int(0.32 * RATE)], hp=350.0, lp=6800.0), 0.00, 0.34)
        mix_into(out, fade_edges(vox, 0.005, 0.05), 0.03, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.02), 1.06), 0.003, 0.06)

    if name == 'comms-ally-hold':
        out = np.zeros(int(0.70 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/hold.ogg')))
        vox = resample_pitch(vox, 0.88)
        vox = fft_eq(vox, hp=88.0, lp=5200.0, bands=[(185, 3.8, 1.1), (1700, 1.5, 1.2), (4200, -4.5, 1.5)])
        shield = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/interface/interface1.wav')))
        mix_into(out, fft_eq(shield[:int(0.24 * RATE)], hp=90.0, lp=2600.0), 0.00, 0.38)
        mix_into(out, fade_edges(vox, 0.004, 0.05), 0.03, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.02), 1.06), 0.003, 0.06)

    if name == 'comms-ally-help':
        out = np.zeros(int(1.10 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/war_call_for_backup.ogg')))
        vox = resample_pitch(vox, 0.91)
        vox = fft_eq(vox, hp=95.0, lp=5400.0, bands=[(195, 3.6, 1.1), (1900, 1.6, 1.2), (4400, -4.5, 1.5)])
        mix_into(out, fade_edges(vox, 0.005, 0.05), 0.02, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.02), 1.06), 0.003, 0.06)

    if name == 'comms-objective':
        out = np.zeros(int(1.48 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Male/objective_achieved.ogg')))
        vox = resample_pitch(vox, 0.91)
        vox = fft_eq(vox, hp=95.0, lp=4900.0, bands=[(195, 3.8, 1.1), (1700, 1.4, 1.2), (4200, -5.0, 1.5)])
        chime = peak_unit(fft_eq(cast_iron_bell(587.33, 0.65), hp=300.0, lp=4800.0))
        mix_into(out, chime, 0.00, 0.22)
        mix_into(out, fade_edges(vox, 0.005, 0.06), 0.04, 0.88)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.20, decay_sec=0.40, tail_extra=0.02), 1.06), 0.003, 0.07)

    if name == 'comms-female':
        out = np.zeros(int(0.62 * RATE), dtype=np.float32)
        vox = peak_unit(trim_silence_1d(load_mono('voiceover_kenney/Female/ready.ogg')))
        vox = resample_pitch(vox, 0.97)
        vox = fft_eq(vox, hp=130.0, lp=5200.0, bands=[(280, 2.2, 1.1), (2200, 1.0, 1.2), (4400, -4.5, 1.5)])
        mix_into(out, fade_edges(vox, 0.004, 0.05), 0.02, 0.84)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.34, tail_extra=0.02), 1.05), 0.003, 0.06)

    if name == 'place':
        out = np.zeros(int(0.40 * RATE), dtype=np.float32)
        wood = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_wood_hit_02.ogg')))
        stone = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_rock_hit_01.ogg')))
        hammer = peak_unit(trim_silence_1d(load_mono('blacksmith_hammer.wav')))
        wood_w = fft_eq(resample_pitch(wood, 0.86)[:int(0.26 * RATE)], hp=65.0, lp=2400.0, bands=[(145, 3.5, 1.0)])
        stone_w = fft_eq(resample_pitch(stone, 0.84)[:int(0.20 * RATE)], hp=80.0, lp=2800.0)
        tap = fft_eq(hammer[:int(0.18 * RATE)], hp=240.0, lp=3600.0)
        mix_into(out, wood_w, 0.00, 0.72)
        mix_into(out, stone_w, 0.025, 0.44)
        mix_into(out, tap, 0.11, 0.28)
        return fade_edges(courtyard_reverb(out, wet=0.12, decay_sec=0.25, tail_extra=0.02), 0.002, 0.05)

    if name == 'bld-town':
        out = np.zeros(int(0.56 * RATE), dtype=np.float32)
        door = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/doorOpen_1.ogg')))
        door_w = fft_eq(door[:int(0.26 * RATE)], hp=110.0, lp=3400.0)
        h1 = peak_unit(plucked_harp(293.66, 0.48, seed=501))
        h2 = peak_unit(plucked_harp(440.00, 0.46, seed=502))
        mix_into(out, door_w, 0.00, 0.48)
        mix_into(out, h1, 0.04, 0.44)
        mix_into(out, h2, 0.11, 0.36)
        return fade_edges(courtyard_reverb(out, wet=0.16, decay_sec=0.34, tail_extra=0.02), 0.003, 0.06)

    if name == 'bld-castle':
        out = np.zeros(int(0.60 * RATE), dtype=np.float32)
        gate = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/world/door.wav')))
        latch = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/metalLatch.ogg')))
        gate_w = fft_eq(resample_pitch(gate, 0.85)[:int(0.40 * RATE)], hp=70.0, lp=2600.0, bands=[(160, 3.0, 1.0)])
        latch_w = fft_eq(latch[:int(0.22 * RATE)], hp=280.0, lp=4800.0)
        horn_bed = peak_unit(medieval_brass([146.83, 220.00], 0.46, attack_sec=0.09, release_sec=0.22))
        mix_into(out, latch_w, 0.00, 0.42)
        mix_into(out, gate_w, 0.02, 0.64)
        mix_into(out, horn_bed, 0.08, 0.24)
        return fade_edges(courtyard_reverb(out, wet=0.24, decay_sec=0.45, tail_extra=0.02), 0.003, 0.07)

    if name == 'bld-dock':
        out = np.zeros(int(0.63 * RATE), dtype=np.float32)
        creak = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/creak2.ogg')))
        wave = peak_unit(load_mono('ocean_wave_prev.ogg')[int(0.6 * RATE):int(1.2 * RATE)])
        bell = peak_unit(fft_eq(cast_iron_bell(739.99, 0.54), hp=320.0, lp=5400.0))
        mix_into(out, fade_edges(fft_eq(wave, hp=180.0, lp=2800.0), 0.06, 0.16), 0.00, 0.26)
        mix_into(out, fft_eq(creak[:int(0.28 * RATE)], hp=140.0, lp=3200.0), 0.00, 0.46)
        mix_into(out, bell, 0.05, 0.56)
        return fade_edges(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.02), 0.003, 0.07)

    if name == 'cannon':
        out = np.zeros(int(1.18 * RATE), dtype=np.float32)
        n = len(out)
        t = np.arange(n, dtype=np.float64) / RATE
        # Black-powder muzzle crack + heavy sub-bass pressure wave
        rng = np.random.default_rng(701)
        crack = fft_eq(rng.standard_normal(n).astype(np.float32), hp=180.0, lp=4600.0)
        crack_env = (np.minimum(1.0, t / 0.002) * np.exp(-t / 0.055)).astype(np.float32)
        sweep_f = 38.0 + 92.0 * np.exp(-t / 0.042)
        sub = (np.sin(TAU * np.cumsum(sweep_f) / RATE) * np.exp(-t / 0.24)).astype(np.float32)
        blast = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_breaking_01.ogg')))
        rumble = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_rock_breaking_01.ogg')))
        blast_d = fft_eq(resample_pitch(blast, 0.72)[:int(0.75 * RATE)], hp=45.0, lp=2200.0, bands=[(90, 4.5, 0.9)])
        rumble_d = fft_eq(resample_pitch(rumble, 0.68)[:int(0.95 * RATE)], hp=42.0, lp=1500.0)
        mix_into(out, crack * crack_env, 0.00, 0.72)
        mix_into(out, sub, 0.00, 0.86)
        mix_into(out, blast_d, 0.005, 0.70)
        mix_into(out, rumble_d, 0.04, 0.52)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.28, decay_sec=0.62, tail_extra=0.04), 1.32), 0.002, 0.14)

    if name == 'trebuchet':
        out = np.zeros(int(0.93 * RATE), dtype=np.float32)
        creak = peak_unit(trim_silence_1d(load_mono('kenney_rpg/OGG/creak1.ogg')))
        bow = peak_unit(trim_silence_1d(load_mono('battle_sfx/battle_sound_effects/Bow.wav')))
        swish = peak_unit(trim_silence_1d(load_mono('swishes/swishes/swish-1.wav')))
        thud = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_wood_hit_02.ogg')))
        mix_into(out, fft_eq(resample_pitch(creak, 0.82)[:int(0.32 * RATE)], hp=110.0, lp=2800.0), 0.00, 0.54)
        mix_into(out, fft_eq(resample_pitch(bow, 0.72)[:int(0.38 * RATE)], hp=90.0, lp=3200.0), 0.14, 0.58)
        mix_into(out, fft_eq(resample_pitch(swish, 0.66)[:int(0.62 * RATE)], hp=85.0, lp=2800.0), 0.20, 0.84)
        mix_into(out, fft_eq(resample_pitch(thud, 0.74)[:int(0.30 * RATE)], hp=55.0, lp=1800.0), 0.26, 0.66)
        mix_into(out, peak_unit(war_drum(62.0, 0.32, seed=712)), 0.25, 0.44)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.20, decay_sec=0.45, tail_extra=0.02), 1.16), 0.003, 0.09)

    if name == 'collapse':
        out = np.zeros(int(1.40 * RATE), dtype=np.float32)
        brk = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_breaking_02.ogg')))
        wood = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_wood_breaking_02.ogg')))
        rock = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_rock_breaking_02.ogg')))
        fall1 = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_rock_falling_02.ogg')))
        fall2 = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_rock_falling_04.ogg')))
        boom = peak_unit(war_drum(48.0, 0.65, seed=721))
        mix_into(out, boom, 0.00, 0.74)
        mix_into(out, fft_eq(resample_pitch(brk, 0.82)[:int(0.85 * RATE)], hp=55.0, lp=3600.0), 0.00, 0.76)
        mix_into(out, fft_eq(resample_pitch(wood, 0.86)[:int(0.60 * RATE)], hp=90.0, lp=4200.0), 0.04, 0.64)
        mix_into(out, fft_eq(resample_pitch(rock, 0.78)[:int(0.85 * RATE)], hp=50.0, lp=3200.0), 0.16, 0.70)
        mix_into(out, fft_eq(fall1[:int(0.75 * RATE)], hp=100.0, lp=4000.0), 0.34, 0.56)
        mix_into(out, fft_eq(fall2[:int(0.65 * RATE)], hp=120.0, lp=3600.0), 0.62, 0.44)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.26, decay_sec=0.58, tail_extra=0.05), 1.24), 0.003, 0.16)

    if name == 'hero-skill':
        out = np.zeros(int(1.30 * RATE), dtype=np.float32)
        steel = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/battle/sword-unsheathe2.wav')))
        shimmer = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/battle/magic1.wav')))
        shimmer_w = fft_eq(resample_pitch(shimmer, 0.88)[:int(0.90 * RATE)], hp=260.0, lp=3800.0)
        drum = peak_unit(war_drum(73.42, 0.42, seed=731))
        brass1 = peak_unit(medieval_brass([293.66, 440.00], 0.32, attack_sec=0.04, release_sec=0.08))
        brass2 = peak_unit(medieval_brass([293.66, 440.00, 587.33], 1.02, attack_sec=0.08, release_sec=0.38))
        mix_into(out, fft_eq(steel[:int(0.42 * RATE)], hp=300.0, lp=7600.0), 0.00, 0.62)
        mix_into(out, drum, 0.00, 0.54)
        mix_into(out, brass1, 0.02, 0.48)
        mix_into(out, brass2, 0.22, 0.66)
        mix_into(out, fade_edges(shimmer_w, 0.04, 0.26), 0.08, 0.28)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.22, decay_sec=0.50, tail_extra=0.05), 1.15), 0.002, 0.12)

    if name == 'boiling-oil':
        out = np.zeros(int(1.26 * RATE), dtype=np.float32)
        n = len(out)
        t = np.arange(n, dtype=np.float64) / RATE
        boil = peak_unit(load_mono('sfx_loops/water_boiling.ogg')[int(0.4 * RATE):int(1.65 * RATE)])
        fire = peak_unit(load_mono('fire_loop.wav')[int(0.5 * RATE):int(1.75 * RATE)])
        rng = np.random.default_rng(741)
        sizzle = fft_eq(rng.standard_normal(n).astype(np.float32), hp=1500.0, lp=6800.0, bands=[(3100, 3.0, 1.2)])
        siz_env = (np.minimum(1.0, t / 0.08) * np.exp(-np.maximum(0.0, t - 0.18) / 0.42)).astype(np.float32)
        whoosh = fft_eq(rng.standard_normal(n).astype(np.float32), hp=85.0, lp=620.0)
        wh_env = (np.minimum(1.0, t / 0.06) * np.exp(-t / 0.28)).astype(np.float32)
        mix_into(out, fade_edges(fft_eq(boil, hp=180.0, lp=4600.0), 0.04, 0.22), 0.00, 0.56)
        mix_into(out, fade_edges(fft_eq(fire, hp=100.0, lp=4800.0), 0.04, 0.24), 0.03, 0.64)
        mix_into(out, sizzle * siz_env, 0.06, 0.46)
        mix_into(out, whoosh * wh_env, 0.00, 0.52)
        return fade_edges(soft_saturate(courtyard_reverb(out, wet=0.18, decay_sec=0.36, tail_extra=0.04), 1.16), 0.004, 0.14)

    if name == 'music-battle':
        # Authentic 80 BPM D-minor Medieval Orchestral Siege Battle Score (8 bars = 24.000s exact seamless stereo loop!)
        beat = 0.75
        bar = 3.0
        loop_n = int(round(24.0 * RATE))
        pad_n = int(round(26.5 * RATE))
        left = np.zeros(pad_n, dtype=np.float32)
        right = np.zeros(pad_n, dtype=np.float32)

        def mix_stereo(sig: np.ndarray, start_sec: float, gain: float, pan: float = 0.0) -> None:
            # Equal-power stereo panning: pan in [-1, 1]
            ang = (pan + 1.0) * (math.pi * 0.25)
            mix_into(left, sig, start_sec, gain * math.cos(ang))
            mix_into(right, sig, start_sec, gain * math.sin(ang))

        # 1. Real CC0 percussive texture clips (snare/frame drum & distant armored clash)
        snare_src = peak_unit(trim_silence_1d(load_mono('rpg_sound_pack/RPG Sound Pack/inventory/armor-light.wav')))
        snare_hit = fft_eq(snare_src[:int(0.14 * RATE)], hp=360.0, lp=3600.0)
        wood_rim = peak_unit(trim_silence_1d(load_mono('breaking_falling/bfh1_hit_05.ogg')))
        wood_rim = fft_eq(wood_rim[:int(0.12 * RATE)], hp=160.0, lp=1800.0)

        # Precompute tuned medieval siege timpani & drums for each bar's root
        bar_roots = [73.42, 58.27, 65.41, 73.42, 73.42, 98.00, 58.27, 55.00]  # D2, Bb1, C2, D2, D2, G2, Bb1, A1
        timp_cache = {f: peak_unit(war_drum(f, 0.52, seed=800 + int(f))) for f in set(bar_roots)}
        frame_lo = peak_unit(war_drum(110.0, 0.22, seed=851))
        frame_hi = peak_unit(war_drum(146.83, 0.16, seed=852))

        for b in range(8):
            t0 = b * bar
            root_d = timp_cache[bar_roots[b]]
            heavy = 1.12 if b >= 4 else 0.94
            # Driving medieval siege pulse: BOOM - da-da-BOOM - BOOM - da-BOOM!
            mix_stereo(root_d, t0 + 0.00, 0.62 * heavy, -0.15)
            mix_stereo(frame_lo, t0 + beat * 0.75, 0.34 * heavy, 0.22)
            mix_stereo(frame_hi, t0 + beat * 1.00, 0.30 * heavy, -0.25)
            mix_stereo(snare_hit, t0 + beat * 1.00, 0.22 * heavy, 0.32)
            mix_stereo(root_d, t0 + beat * 1.50, 0.50 * heavy, 0.12)
            mix_stereo(root_d, t0 + beat * 2.00, 0.56 * heavy, -0.18)
            mix_stereo(wood_rim, t0 + beat * 2.50, 0.28 * heavy, 0.28)
            mix_stereo(frame_lo, t0 + beat * 2.75, 0.34 * heavy, -0.22)
            mix_stereo(snare_hit, t0 + beat * 3.00, 0.28 * heavy, 0.30)
            mix_stereo(frame_hi, t0 + beat * 3.25, 0.28 * heavy, -0.28)
            mix_stereo(frame_lo, t0 + beat * 3.50, 0.38 * heavy, 0.18)
            if b in (3, 7):
                # Urgent triplet siege turnaround into Bar 5 and Bar 1!
                mix_stereo(root_d, t0 + beat * 3.33, 0.44, -0.12)
                mix_stereo(root_d, t0 + beat * 3.66, 0.52, 0.15)
                mix_stereo(snare_hit, t0 + beat * 3.75, 0.32, 0.0)

        # 2. Driving medieval lute / string-section galloping ostinato (D minor)
        bar_ostinato = [
            [146.83, 220.00, 174.61, 220.00],  # Dm
            [116.54, 174.61, 146.83, 174.61],  # Bb
            [130.81, 196.00, 164.81, 196.00],  # C
            [146.83, 220.00, 164.81, 220.00],  # Dm -> A
            [146.83, 220.00, 293.66, 220.00],  # Dm high
            [196.00, 233.08, 293.66, 233.08],  # Gm
            [116.54, 174.61, 130.81, 196.00],  # Bb -> C
            [110.00, 164.81, 220.00, 164.81],  # A7 turnaround
        ]
        harp_cache = {}
        for b, pat in enumerate(bar_ostinato):
            t0 = b * bar
            for step in range(8):
                f = pat[step % 4]
                if f not in harp_cache:
                    harp_cache[f] = peak_unit(plucked_harp(f, 0.48, seed=900 + int(f), damping=0.9942))
                accent = 0.24 if step % 2 == 0 else 0.16
                mix_stereo(harp_cache[f], t0 + step * (beat * 0.5), accent, -0.34 if step % 2 == 0 else 0.34)

        # 3. Deep bowed cello / low horn bedrock (rich dark medieval pedal)
        beds = [
            (0.0, [73.42, 146.83], 3.1),
            (3.0, [58.27, 116.54], 3.1),
            (6.0, [65.41, 130.81], 3.1),
            (9.0, [73.42, 146.83], 1.6),
            (10.5, [55.00, 110.00], 1.6),
            (12.0, [73.42, 146.83], 3.1),
            (15.0, [98.00, 146.83], 3.1),
            (18.0, [58.27, 116.54], 1.6),
            (19.5, [65.41, 130.81], 1.6),
            (21.0, [55.00, 110.00], 3.1),
        ]
        for st, freqs, dur in beds:
            pad_b = peak_unit(medieval_brass(freqs, dur, attack_sec=0.26, release_sec=0.45))
            pad_b = fft_eq(pad_b, hp=50.0, lp=680.0)
            mix_stereo(pad_b, st, 0.42, -0.22)
            mix_stereo(pad_b, st + 0.014, 0.36, 0.22)

        # 4. Warm low-mid Orchestral French Horn battle theme (true cinematic horn range D3-D4, warm LP 1550 Hz!)
        melody = [
            # Phrase A (Bars 1-4): Dark determined war march horns (low-mid register = authentic orchestral brass)
            (0.00, [146.83, 220.00], 1.15, 0.36),  # D3+A3
            (1.125, [174.61], 0.40, 0.30),         # F3
            (1.50, [220.00], 1.40, 0.40),          # A3
            (3.00, [233.08], 1.10, 0.38),          # Bb3
            (4.125, [220.00], 0.40, 0.32),         # A3
            (4.50, [196.00], 0.75, 0.34),          # G3
            (5.25, [174.61], 0.75, 0.32),          # F3
            (6.00, [196.00], 1.12, 0.36),          # G3
            (7.125, [174.61], 0.40, 0.30),         # F3
            (7.50, [164.81], 1.38, 0.34),          # E3
            (9.00, [146.83, 220.00], 1.48, 0.38),  # D3+A3
            (10.50, [164.81, 220.00], 1.38, 0.36), # E3+A3
            # Phrase B (Bars 5-8): Heroic rising horns beneath real CC0 orchestral strings & choir!
            (12.00, [220.00, 293.66], 1.15, 0.42), # A3+D4
            (13.125, [261.63], 0.40, 0.34),        # C4
            (13.50, [233.08, 293.66], 1.40, 0.40), # Bb3+D4
            (15.00, [220.00, 293.66], 0.74, 0.38), # A3+D4
            (15.75, [196.00, 233.08], 0.74, 0.36), # G3+Bb3
            (16.50, [220.00], 1.38, 0.38),         # A3
            (18.00, [233.08, 293.66], 1.12, 0.40), # Bb3+D4
            (19.125, [261.63], 0.40, 0.36),        # C4
            (19.50, [261.63, 329.63], 1.45, 0.40), # C4+E4
            (21.00, [220.00, 293.66], 1.10, 0.38), # A3+D4
            (22.125, [196.00], 0.40, 0.34),        # G3
            (22.50, [164.81, 220.00], 1.42, 0.38), # E3+A3 -> resolves cleanly to D3 on bar 1!
        ]
        for st, freqs, dur, amp in melody:
            horn = peak_unit(medieval_brass(freqs, dur, attack_sec=0.11, release_sec=0.28))
            horn = fft_eq(horn, hp=95.0, lp=1520.0, bands=[(290, 2.5, 0.9), (980, -2.0, 1.2)])
            mix_stereo(horn, st, amp, 0.12)

        # 5. Real recorded CC0 medieval orchestral strings & choir woven across the entire 24s loop!
        lament_st = load_pcm(SRC_DIR / 'music_tension_lament.mp3', True)
        lam_len = min(len(lament_st), int(12.8 * RATE))
        lam_l = peak_unit(fade_edges(fft_eq(lament_st[:lam_len, 0], hp=140.0, lp=4400.0), 0.9, 1.6))
        lam_r = peak_unit(fade_edges(fft_eq(lament_st[:lam_len, 1], hp=140.0, lp=4400.0), 0.9, 1.6))
        mix_into(left, lam_l, 0.0, 0.34)
        mix_into(right, lam_r, 0.0, 0.34)

        choir_st = load_pcm(SRC_DIR / 'music_climax_choir.mp3', True)
        ch_want = int(12.2 * RATE)
        ch_start = max(0, int(len(choir_st) * 0.46))
        if ch_start + ch_want > len(choir_st):
            ch_start = max(0, len(choir_st) - ch_want)
        ch_l = peak_unit(fade_edges(fft_eq(choir_st[ch_start:ch_start + ch_want, 0], hp=160.0, lp=4600.0), 1.4, 2.0))
        ch_r = peak_unit(fade_edges(fft_eq(choir_st[ch_start:ch_start + ch_want, 1], hp=160.0, lp=4600.0), 1.4, 2.0))
        mix_into(left, ch_l, 11.8, 0.44)
        mix_into(right, ch_r, 11.8, 0.44)

        warhorn = peak_unit(trim_silence_1d(load_mono('horn_war3.ogg')))
        wh_seg = fade_edges(fft_eq(warhorn[:int(2.0 * RATE)], hp=85.0, lp=1650.0), 0.14, 0.40)
        mix_stereo(wh_seg, 11.75, 0.28, -0.32)

        # 6. Lush stereo courtyard reverb + exact tail-wrap for a 100% seamless 24.000s musical loop!
        wet_l = courtyard_reverb(left, wet=0.24, decay_sec=0.58, tail_extra=0.0)[:pad_n]
        wet_r = courtyard_reverb(right, wet=0.24, decay_sec=0.58, tail_extra=0.0)[:pad_n]
        out_l = wet_l[:loop_n].copy()
        out_r = wet_r[:loop_n].copy()
        tail_len = pad_n - loop_n
        out_l[:tail_len] += wet_l[loop_n:pad_n]
        out_r[:tail_len] += wet_r[loop_n:pad_n]
        # Ultra-short 12 ms safety boundary blend so zero sample discontinuity can ever exist
        xf = int(0.012 * RATE)
        ramp = np.linspace(0.0, 1.0, xf, dtype=np.float32)
        out_l[:xf] = out_l[:xf] * ramp + out_l[-xf:] * (1.0 - ramp)
        out_r[:xf] = out_r[:xf] * ramp + out_r[-xf:] * (1.0 - ramp)
        stereo = np.stack([soft_saturate(out_l, 1.14), soft_saturate(out_r, 1.14)], axis=1)
        return stereo.astype(np.float32)

    raise ValueError(f'Unknown mastering recipe: {name}')


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
    xfade = min(int(1.6 * RATE), max(int(0.25 * RATE), int(avail * 0.16)))
    want = int(target_dur * RATE)
    if avail <= want + xfade:
        seg_len = max(int(0.8 * RATE), avail - xfade)
    else:
        seg_len = want
    if seg_len + xfade > avail:
        xfade = max(int(0.15 * RATE), avail // 6)
        seg_len = avail - xfade
    body = pcm[start : start + seg_len].copy()
    tail = pcm[start + seg_len : start + seg_len + xfade]
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
    fi = min(int(0.003 * RATE), len(pcm) // 4)
    fo = min(int(0.028 * RATE), len(pcm) // 3)
    if fi > 1:
        pcm[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    if fo > 1:
        pcm[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[:, None]
    return pcm


def normalize(pcm: np.ndarray, target_peak: float) -> np.ndarray:
    pcm = pcm - np.mean(pcm, axis=0, keepdims=True)
    peak = float(np.max(np.abs(pcm)))
    if peak < 1e-5:
        raise RuntimeError('Audio cue is silent')
    gain = target_peak / peak
    out = np.clip(pcm * gain, -0.98, 0.98).astype(np.float32)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    only_names = None
    env_only = os.environ.get('ONLY_CUES', '').strip()
    if env_only:
        only_names = set(env_only.split(','))
    elif '--only' in sys.argv:
        idx = sys.argv.index('--only')
        if idx + 1 < len(sys.argv):
            only_names = set(sys.argv[idx + 1].split(','))
    if not only_names:
        for old in OUT_DIR.iterdir():
            if old.suffix.lower() in {'.wav', '.ogg', '.mp3'}:
                old.unlink()

    manifest_cues = {}
    license_lines = [
        'CC0 1.0 Universal (Public Domain Dedication)',
        'https://creativecommons.org/publicdomain/zero/1.0/',
        '',
        'All audio assets in /audio/ are real recorded studio and field-recorded CC0 1.0',
        'Public Domain audio files and original acoustic mastering dedicated to CC0 1.0',
        'for Crowns of the Frontier by scripts/master-cc0-audio.py (encoded to gapless',
        '44.1 kHz Ogg Vorbis with universal MP3 fallback for Safari/iOS). All files are',
        'bundled locally for 100% offline playback with zero runtime network dependencies.',
        '',
        'The runtime retains a procedural Web Audio fallback so the game remains',
        'playable even if audio assets cannot be fetched or decoded.',
        '',
        'Verified CC0 1.0 Source Provenance (per cue):',
    ]

    existing_manifest = {}
    if only_names and (OUT_DIR / 'manifest.json').is_file():
        existing_manifest = json.loads((OUT_DIR / 'manifest.json').read_text(encoding='utf-8')).get('cues', {})

    total_ogg = 0
    total_mp3 = 0

    for name, group, rel_src, loop, stereo, start_sec, max_dur, target_peak, credit in CUES:
        ogg_name = f'{name}.ogg'
        mp3_name = f'{name}.mp3'
        ogg_path = OUT_DIR / ogg_name
        mp3_path = OUT_DIR / mp3_name
        if only_names and name not in only_names and name in existing_manifest and ogg_path.is_file() and mp3_path.is_file():
            cue_entry = existing_manifest[name]
            manifest_cues[name] = cue_entry
            total_ogg += cue_entry['bytes']
            total_mp3 += cue_entry['fallbackBytes']
            license_lines.append(f'- {name} ({ogg_name} / {mp3_name}): {credit}')
            continue
        if rel_src.startswith('recipe:'):
            sig = build_recipe(rel_src.split(':', 1)[1])
            pcm = sig if sig.ndim == 2 else sig[:, None]
            if stereo and pcm.shape[1] == 1:
                pcm = np.repeat(pcm, 2, axis=1)
            if not loop and len(pcm) > int(max_dur * RATE):
                pcm = pcm[:int(max_dur * RATE)].copy()
        else:
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
