import os
from PIL import Image, ImageDraw, ImageFont

WIDTH = 2500
HEIGHT = 843
FONT_PATH_BOLD = "C:/Windows/Fonts/msjhbd.ttc"

def get_font(title_size):
    return ImageFont.truetype(FONT_PATH_BOLD, title_size)

def create_employee_menu():
    img = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    title_font = get_font(title_size=120)

    col_w = WIDTH // 3 # 833
    cy = HEIGHT // 2 # 421, vertical center

    # --- Col 1: 考勤打卡 (LINE Green 底，白字 CTA) ---
    c1_center = col_w // 2
    draw.rectangle([0, 0, col_w, HEIGHT], fill=(6, 199, 85))
    draw.text((c1_center, cy), "考勤打卡", anchor="mm", font=title_font, fill=(255, 255, 255))

    # Divider 1
    draw.line([(col_w, 0), (col_w, HEIGHT)], fill=(209, 213, 219), width=3)

    # --- Col 2: 排班月曆 (Pastel Blue 底，Brand Blue CTA) ---
    c2_start = col_w
    c2_center = c2_start + col_w // 2
    draw.rectangle([c2_start, 0, c2_start + col_w, HEIGHT], fill=(239, 246, 255)) # #EFF6FF
    draw.rectangle([c2_start, 0, c2_start + col_w, 18], fill=(59, 130, 246))       # #3B82F6 Top Bar
    draw.text((c2_center, cy), "排班月曆", anchor="mm", font=title_font, fill=(29, 78, 216)) # #1D4ED8

    # Divider 2
    draw.line([(c2_start + col_w, 0), (c2_start + col_w, HEIGHT)], fill=(209, 213, 219), width=3)

    # --- Col 3: 線上簽核 (Pastel Amber 底，Brand Amber CTA) ---
    c3_start = c2_start + col_w
    c3_center = c3_start + (WIDTH - c3_start) // 2
    draw.rectangle([c3_start, 0, WIDTH, HEIGHT], fill=(254, 243, 199)) # #FEF3C7
    draw.rectangle([c3_start, 0, WIDTH, 18], fill=(245, 158, 11))       # #F59E0B Top Bar
    draw.text((c3_center, cy), "線上簽核", anchor="mm", font=title_font, fill=(180, 83, 9)) # #B45309

    out_path = os.path.join(os.path.dirname(__file__), "richmenu_employee.png")
    img.save(out_path, format="PNG", optimize=True)
    print(f"Generated Employee Menu Image: {out_path} ({os.path.getsize(out_path)} bytes)")
    return out_path

def create_manager_menu():
    HEIGHT_MGR = 1686
    img = Image.new("RGB", (WIDTH, HEIGHT_MGR), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    title_font = get_font(title_size=120)

    col_w = WIDTH // 3 # 833 each
    row1_cy = HEIGHT // 2 # 421, vertical center of row 1
    row2_cy = HEIGHT + HEIGHT // 2 # 843 + 421 = 1264, vertical center of row 2

    # ================= ROW 1 (個人基礎考勤，完全對齊員工選單) =================
    # --- Col 1: 考勤打卡 (LINE Green 底，白字 CTA) ---
    c1_center = col_w // 2
    draw.rectangle([0, 0, col_w, HEIGHT], fill=(6, 199, 85))
    draw.text((c1_center, row1_cy), "考勤打卡", anchor="mm", font=title_font, fill=(255, 255, 255))

    # Divider 1
    draw.line([(col_w, 0), (col_w, HEIGHT)], fill=(209, 213, 219), width=3)

    # --- Col 2: 排班月曆 (Pastel Blue 底，Brand Blue CTA) ---
    c2_start = col_w
    c2_center = c2_start + col_w // 2
    draw.rectangle([c2_start, 0, c2_start + col_w, HEIGHT], fill=(239, 246, 255)) # #EFF6FF
    draw.rectangle([c2_start, 0, c2_start + col_w, 18], fill=(59, 130, 246))       # #3B82F6 Top Bar
    draw.text((c2_center, row1_cy), "排班月曆", anchor="mm", font=title_font, fill=(29, 78, 216)) # #1D4ED8

    # Divider 2
    draw.line([(c2_start + col_w, 0), (c2_start + col_w, HEIGHT)], fill=(209, 213, 219), width=3)

    # --- Col 3: 線上簽核 (Pastel Amber 底，Brand Amber CTA) ---
    c3_start = c2_start + col_w
    c3_center = c3_start + (WIDTH - c3_start) // 2
    draw.rectangle([c3_start, 0, WIDTH, HEIGHT], fill=(254, 243, 199)) # #FEF3C7
    draw.rectangle([c3_start, 0, WIDTH, 18], fill=(245, 158, 11))       # #F59E0B Top Bar
    draw.text((c3_center, row1_cy), "線上簽核", anchor="mm", font=title_font, fill=(180, 83, 9)) # #B45309

    # ================= HORIZONTAL DIVIDER =================
    draw.line([(0, HEIGHT), (WIDTH, HEIGHT)], fill=(209, 213, 219), width=4)

    # ================= ROW 2 (門市管理工作台 1*3 寬按鈕) =================
    # 主管沉穩曜石靛青藍底 (#4338CA)，上邊緣帶高雅紫晶漸層飾條 (#7E22CE)，白字大字級 CTA
    draw.rectangle([0, HEIGHT, WIDTH, HEIGHT_MGR], fill=(67, 56, 202)) # #4338CA
    draw.rectangle([0, HEIGHT, WIDTH, HEIGHT + 20], fill=(126, 34, 206)) # #7E22CE Accent Bar
    draw.text((WIDTH // 2, row2_cy), "門市管理工作台", anchor="mm", font=title_font, fill=(255, 255, 255))

    out_path = os.path.join(os.path.dirname(__file__), "richmenu_manager.png")
    img.save(out_path, format="PNG", optimize=True)
    print(f"Generated Manager Menu Image (2500x1686): {out_path} ({os.path.getsize(out_path)} bytes)")
    return out_path

if __name__ == "__main__":
    create_employee_menu()
    create_manager_menu()
