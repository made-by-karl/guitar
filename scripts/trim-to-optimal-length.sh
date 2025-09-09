#!/bin/bash
# Trim MP3 samples to optimal length (3 seconds)
# Usage: ./trim-to-optimal-length.sh [file_or_directory] [target_length]
# Examples:
#   ./trim-to-optimal-length.sh myfile.mp3              # Single file, 3s default
#   ./trim-to-optimal-length.sh myfile.mp3 2.5          # Single file, 2.5s
#   ./trim-to-optimal-length.sh /path/to/samples        # All MP3s in directory
#   ./trim-to-optimal-length.sh /path/to/samples 4.0    # All MP3s in directory, 4s

# Function to trim samples to optimal length
trim_to_optimal() {
    local input_file="$1"
    local output_dir="$2"
    local target_length="$3"
    local filename=$(basename "$input_file")
    
    # Get duration of input file
    local duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$input_file" 2>/dev/null)
    
    echo "Trimming $filename (${duration}s) to ${target_length}s..."
    
    # Check if file is already shorter than or equal to target length
    # Use awk for floating point comparison instead of bc
    local should_trim=$(awk "BEGIN {print ($duration > $target_length)}")
    
    if [[ "$should_trim" == "1" ]]; then
        # Normal trim: remove silence and limit length
        echo "  🔄 File is longer than ${target_length}s, trimming..."
        ffmpeg -i "$input_file" \
            -af "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB" \
            -t "$target_length" \
            -y "$output_dir/$filename" 2>/dev/null
    else
        echo "  ⚠️  File is already ${duration}s (≤ ${target_length}s), only removing silence..."
        # Just remove silence, don't truncate - use gentler threshold
        ffmpeg -i "$input_file" \
            -af "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB" \
            -y "$output_dir/$filename" 2>/dev/null
    fi
    
    # Check if output file was created successfully and has content
    if [[ -f "$output_dir/$filename" ]]; then
        local file_size=$(stat -c%s "$output_dir/$filename" 2>/dev/null || echo "0")
        if [[ "$file_size" -gt 1000 ]]; then
            local new_duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$output_dir/$filename" 2>/dev/null)
            if [[ -n "$new_duration" ]]; then
                echo "  ✅ Output: ${new_duration}s"
            else
                echo "  ✅ Output file created successfully"
            fi
        else
            echo "  ⚠️  Output file is too small (${file_size} bytes), using fallback..."
            # Remove the empty file and copy original
            rm -f "$output_dir/$filename"
            cp "$input_file" "$output_dir/$filename"
            echo "  📋 Copied original file as fallback"
        fi
    else
        echo "  ❌ Failed to create output file"
        # Fallback: just copy the file
        cp "$input_file" "$output_dir/$filename"
        echo "  📋 Copied original file as fallback"
    fi
}

# Parse command line arguments
INPUT_PATH="${1:-.}"  # Default to current directory
TARGET_LENGTH="${2:-3.0}"  # Default to 3 seconds

# Convert to absolute path
INPUT_PATH=$(realpath "$INPUT_PATH")

echo "=== MP3 Trimming Script ==="
echo "Input: $INPUT_PATH"
echo "Target length: ${TARGET_LENGTH}s"
echo ""

# Check if input is a file or directory
if [[ -f "$INPUT_PATH" ]]; then
    # Single file mode
    if [[ "$INPUT_PATH" == *.mp3 ]]; then
        echo "Processing single file: $(basename "$INPUT_PATH")"
        MP3_FILES=("$INPUT_PATH")
        SOURCE_DIR=$(dirname "$INPUT_PATH")
    else
        echo "❌ File is not an MP3: $INPUT_PATH"
        exit 1
    fi
elif [[ -d "$INPUT_PATH" ]]; then
    # Directory mode
    echo "Processing directory: $INPUT_PATH"
    SOURCE_DIR="$INPUT_PATH"
    # Find all MP3 files in source directory
    MP3_FILES=($(find "$SOURCE_DIR" -name "*.mp3" -type f))
    
    if [ ${#MP3_FILES[@]} -eq 0 ]; then
        echo "❌ No MP3 files found in $SOURCE_DIR"
        exit 1
    fi
else
    echo "❌ Input path does not exist: $INPUT_PATH"
    exit 1
fi

echo "Found ${#MP3_FILES[@]} MP3 files to process"

# Create output directory
OPTIMIZED_DIR="${SOURCE_DIR}_optimized"
mkdir -p "$OPTIMIZED_DIR"

# Process all MP3 files
echo ""
echo "Optimizing sample lengths..."
for file in "${MP3_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        trim_to_optimal "$file" "$OPTIMIZED_DIR" "$TARGET_LENGTH"
    fi
done

# Show file size comparison
echo ""
echo "=== File Size Comparison ==="
echo "Original files:"
du -sh "$SOURCE_DIR"

echo "Optimized files:"
du -sh "$OPTIMIZED_DIR"

echo ""
echo "Detailed comparison:"
echo "Original total size: $(du -sh "$SOURCE_DIR" | cut -f1)"
echo "Optimized total size: $(du -sh "$OPTIMIZED_DIR" | cut -f1)"

# Calculate savings
ORIGINAL_SIZE=$(du -sb "$SOURCE_DIR" | cut -f1)
OPTIMIZED_SIZE=$(du -sb "$OPTIMIZED_DIR" | cut -f1)
SAVINGS=$((ORIGINAL_SIZE - OPTIMIZED_SIZE))
PERCENTAGE=$((SAVINGS * 100 / ORIGINAL_SIZE))

echo "Space saved: $(echo $SAVINGS | numfmt --to=iec) (${PERCENTAGE}%)"

echo ""
echo "=== Results ==="
echo "✅ Optimization complete!"
echo "📁 Original files remain in: $SOURCE_DIR"
echo "📁 Optimized files in: $OPTIMIZED_DIR"