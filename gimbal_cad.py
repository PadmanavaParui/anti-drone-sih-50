"""
Parametric 2-axis (pan-tilt) gimbal bracket for the anti-drone EO/IR + antenna
sensor platform. Sized around 2x NEMA17 steppers (per the BOM).

Exports:
  - gimbal_assembly.step  (import directly into Onshape / any CAD tool)
  - gimbal_assembly.stl   (for 3D printing / quick viewing)
  - orthographic SVG views (front/top/side) for quick visual sanity-check

All dimensions in mm. Adjust the PARAMETERS block to fit your actual printed
NEMA17 + bearing + fastener stock without touching the geometry code below.
"""

import cadquery as cq
from cadquery import exporters

# ---------------------------------------------------------------------------
# PARAMETERS — tune these to match your actual hardware
# ---------------------------------------------------------------------------
NEMA17_BOLT_SPACING = 31.0      # mm, standard NEMA17 square bolt pattern
NEMA17_BOLT_DIA = 3.4           # mm, clearance for M3
NEMA17_BOSS_DIA = 22.5          # mm, NEMA17 pilot boss diameter
NEMA17_BOSS_DEPTH = 2.0         # mm, recess depth for the boss
SHAFT_CLEARANCE_DIA = 6.5       # mm, clearance for a 5mm NEMA17 shaft + coupler

BASE_SIZE = 100.0               # mm, square base plate side
BASE_THK = 6.0
BASE_MOUNT_HOLE_DIA = 4.3       # M4 tripod/enclosure mounting holes
BASE_MOUNT_INSET = 10.0

TURNTABLE_DIA = 90.0
TURNTABLE_THK = 6.0
TURNTABLE_BOLT_PATTERN = 60.0   # square pattern matching yoke base
TURNTABLE_BOLT_DIA = 3.4

YOKE_BASE_DIA = 90.0
YOKE_BASE_THK = 6.0
YOKE_ARM_HEIGHT = 90.0
YOKE_ARM_WIDTH = 22.0
YOKE_ARM_THK = 8.0
YOKE_ARM_GAP = 70.0             # inner gap between the two arms

SENSOR_PLATE_L = 80.0
SENSOR_PLATE_W = 50.0
SENSOR_PLATE_THK = 4.0
TILT_SHAFT_CLEARANCE_DIA = 6.5

BEARING_BORE_DIA = 8.0          # idler-side bearing bore (e.g. 608 bearing bore)


# ---------------------------------------------------------------------------
# Helper: NEMA17 mounting hole pattern (4 bolts + center clearance + boss)
# ---------------------------------------------------------------------------
def nema17_cutout(workplane, boss_recess=True):
    wp = workplane.rect(NEMA17_BOLT_SPACING, NEMA17_BOLT_SPACING, forConstruction=True) \
                  .vertices().hole(NEMA17_BOLT_DIA)
    wp = wp.circle(SHAFT_CLEARANCE_DIA / 2).cutThruAll()
    if boss_recess:
        wp = workplane.circle(NEMA17_BOSS_DIA / 2).cutBlind(-NEMA17_BOSS_DEPTH)
    return wp


# ---------------------------------------------------------------------------
# 1. Base plate — pan motor mounts underneath, shaft passes through center
# ---------------------------------------------------------------------------
base_plate = (
    cq.Workplane("XY")
    .box(BASE_SIZE, BASE_SIZE, BASE_THK, centered=(True, True, False))
)
# corner mounting holes
corner_offset = BASE_SIZE / 2 - BASE_MOUNT_INSET
base_plate = (
    base_plate.faces(">Z").workplane()
    .pushPoints([(corner_offset, corner_offset), (-corner_offset, corner_offset),
                 (corner_offset, -corner_offset), (-corner_offset, -corner_offset)])
    .hole(BASE_MOUNT_HOLE_DIA)
)
# pan motor bolt pattern + shaft clearance (through-hole, motor bolts from underside)
base_plate = (
    base_plate.faces(">Z").workplane()
    .rect(NEMA17_BOLT_SPACING, NEMA17_BOLT_SPACING, forConstruction=True)
    .vertices().hole(NEMA17_BOLT_DIA)
)
base_plate = (
    base_plate.faces(">Z").workplane()
    .circle(SHAFT_CLEARANCE_DIA / 2).cutThruAll()
)

# ---------------------------------------------------------------------------
# 2. Turntable — sits above base plate, coupled to pan motor shaft, carries yoke
# ---------------------------------------------------------------------------
turntable = (
    cq.Workplane("XY")
    .circle(TURNTABLE_DIA / 2).extrude(TURNTABLE_THK)
    .faces(">Z").workplane()
    .circle(SHAFT_CLEARANCE_DIA / 2).cutThruAll()
    .faces(">Z").workplane()
    .rect(TURNTABLE_BOLT_PATTERN, TURNTABLE_BOLT_PATTERN, forConstruction=True)
    .vertices().hole(TURNTABLE_BOLT_DIA)
)

# ---------------------------------------------------------------------------
# 3. Yoke (U-bracket) — base flange + two vertical arms
#    Arm A (x = +gap/2): carries tilt motor, shaft passes through to inside
#    Arm B (x = -gap/2): idler bearing bore
# ---------------------------------------------------------------------------
yoke_base = (
    cq.Workplane("XY")
    .circle(YOKE_BASE_DIA / 2).extrude(YOKE_BASE_THK)
    .faces(">Z").workplane()
    .rect(TURNTABLE_BOLT_PATTERN, TURNTABLE_BOLT_PATTERN, forConstruction=True)
    .vertices().hole(TURNTABLE_BOLT_DIA)
)

arm_z_center = YOKE_BASE_THK + YOKE_ARM_HEIGHT / 2
arm_x = YOKE_ARM_GAP / 2 + YOKE_ARM_THK / 2

arm_a = (  # motor side
    cq.Workplane("XY", origin=(arm_x, 0, arm_z_center))
    .box(YOKE_ARM_THK, YOKE_ARM_WIDTH, YOKE_ARM_HEIGHT)
)
arm_b = (  # idler side
    cq.Workplane("XY", origin=(-arm_x, 0, arm_z_center))
    .box(YOKE_ARM_THK, YOKE_ARM_WIDTH, YOKE_ARM_HEIGHT)
)

tilt_axis_z = YOKE_BASE_THK + YOKE_ARM_HEIGHT - 20  # tilt pivot height near arm top

# tilt motor mount on the outer face of arm_a, shaft bored through to inner side
arm_a = (
    arm_a.faces(">X").workplane(centerOption="CenterOfBoundBox",
                                 origin=(arm_x, 0, tilt_axis_z))
    .rect(NEMA17_BOLT_SPACING, NEMA17_BOLT_SPACING, forConstruction=True)
    .vertices().hole(NEMA17_BOLT_DIA)
)
arm_a = (
    arm_a.faces(">X").workplane(centerOption="CenterOfBoundBox",
                                 origin=(arm_x, 0, tilt_axis_z))
    .circle(TILT_SHAFT_CLEARANCE_DIA / 2).cutThruAll()
)

# idler bearing bore through arm_b at the same height
arm_b = (
    arm_b.faces(">X").workplane(centerOption="CenterOfBoundBox",
                                 origin=(-arm_x, 0, tilt_axis_z))
    .circle(BEARING_BORE_DIA / 2).cutThruAll()
)

yoke = yoke_base.union(arm_a).union(arm_b)

# ---------------------------------------------------------------------------
# 4. Sensor platform — spans between the arms on the tilt shaft
# ---------------------------------------------------------------------------
sensor_plate = (
    cq.Workplane("XY", origin=(0, 0, tilt_axis_z))
    .box(SENSOR_PLATE_L, YOKE_ARM_GAP - 2, SENSOR_PLATE_THK)
    # mounting holes for camera module + antenna clamp on top face
    .faces(">Z").workplane()
    .pushPoints([(-20, 0), (20, 0)])
    .hole(3.2)
)

# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------
assy = cq.Assembly()
assy.add(base_plate, name="base_plate", color=cq.Color(0.55, 0.55, 0.58, 1))
assy.add(turntable, name="turntable", loc=cq.Location(cq.Vector(0, 0, BASE_THK)),
          color=cq.Color(0.75, 0.75, 0.78, 1))
assy.add(yoke, name="yoke", loc=cq.Location(cq.Vector(0, 0, BASE_THK + TURNTABLE_THK)),
          color=cq.Color(0.2, 0.35, 0.6, 1))
assy.add(sensor_plate, name="sensor_plate",
          loc=cq.Location(cq.Vector(0, 0, BASE_THK + TURNTABLE_THK)),
          color=cq.Color(0.2, 0.55, 0.4, 1))

if __name__ == "__main__":
    assy.save("gimbal_assembly.step")

    # combined solid for STL (assemblies export fine to STL per-shape too,
    # but a single fused solid is easier to eyeball/print-check)
    combined = (
        base_plate
        .union(turntable.translate((0, 0, BASE_THK)))
        .union(yoke.translate((0, 0, BASE_THK + TURNTABLE_THK)))
        .union(sensor_plate.translate((0, 0, BASE_THK + TURNTABLE_THK)))
    )
    exporters.export(combined, "gimbal_assembly.stl")

    # orthographic views for a quick visual check
    exporters.export(combined, "view_front.svg",
                      opt={"projectionDir": (0, -1, 0), "showHidden": False})
    exporters.export(combined, "view_top.svg",
                      opt={"projectionDir": (0, 0, 1), "showHidden": False})
    exporters.export(combined, "view_iso.svg",
                      opt={"projectionDir": (1, -1, 1), "showHidden": False})

    print("Exported: gimbal_assembly.step, gimbal_assembly.stl, "
          "view_front.svg, view_top.svg, view_iso.svg")
