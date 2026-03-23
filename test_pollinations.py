
import sys
import os

print("Sys path:", sys.path)
try:
    import pollinations
    print("Successfully imported pollinations from:", pollinations.__file__)
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

print("Testing Pollinations Library...")
try:
    # Try using the Image class directly as per inspection
    # It seems to be a class that might return the image or have methods
    print(" calling pollinations.Image()...")
    image_obj = pollinations.Image(
        prompt="A beautiful sunset over Seoul, realistic, 8k",
        model="flux",
        width=1280,
        height=720,
        seed=12345
    )
    
    print(f"Result type: {type(image_obj)}")
    print(f"Result: {image_obj}")
    print(f"Dir(image_obj): {dir(image_obj)}")

    if os.path.exists("pollinations-image.jpeg"):
        print("pollinations-image.jpeg was created automatically!")
        os.rename("pollinations-image.jpeg", "test_lib_success.jpg")
        print("Renamed to test_lib_success.jpg")
    
    # If it's an object, check for save method
    if hasattr(image_obj, 'save'):
        image_obj.save("test_lib_success.jpg")
        print("Saved to test_lib_success.jpg")
    elif hasattr(image_obj, 'url'):
         print(f"URL: {image_obj.url}")
         
except Exception as e:
    print(f"Library failed: {e}")

