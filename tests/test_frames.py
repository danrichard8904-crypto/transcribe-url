import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from transcribe_url import compute_frame_timestamps


def test_five_second_video_gets_dense_then_sparse_timestamps():
    result = compute_frame_timestamps(5.0)
    assert result == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]


def test_short_video_only_gets_dense_timestamps_up_to_its_duration():
    result = compute_frame_timestamps(2.0)
    assert result == [0.0, 0.5, 1.0, 1.5]


def test_very_short_video_still_gets_one_timestamp():
    result = compute_frame_timestamps(0.3)
    assert result == [0.0]


import subprocess

from transcribe_url import extract_frames


def test_extract_frames_creates_expected_frame_count(tmp_path):
    video_path = tmp_path / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "testsrc=duration=5:size=320x240:rate=10",
            "-pix_fmt", "yuv420p", str(video_path),
        ],
        capture_output=True, check=True,
    )
    out_dir = tmp_path / "frames"

    frame_paths = extract_frames(video_path, out_dir)

    assert len(frame_paths) == 7
    for frame_path in frame_paths:
        assert frame_path.is_file()
        assert frame_path.stat().st_size > 0
