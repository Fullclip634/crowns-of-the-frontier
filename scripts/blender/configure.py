"""Enable the project-local Blender connector without changing other profiles."""

import json

import bpy


bpy.ops.preferences.addon_enable(module="blender_mcp")
bpy.context.preferences.addons["blender_mcp"].preferences.telemetry_consent = False
bpy.context.preferences.system.use_gpu_subdivision = False
bpy.context.scene.blendermcp_auto_start_server = True
bpy.context.scene.blendermcp_port = 9876
bpy.ops.wm.save_userpref()

print(json.dumps({
    "blender": bpy.app.version_string,
    "connector_enabled": "blender_mcp" in bpy.context.preferences.addons,
    "config": bpy.utils.user_resource("CONFIG"),
    "scripts": bpy.utils.user_resource("SCRIPTS"),
}))
