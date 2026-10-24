"""Package an editable workshop and a laid-out gallery after runtime export."""
import bpy,math
from mathutils import Vector

def descendants(root):return [root]+[part for child in root.children for part in descendants(child)]

def finish_figure_study(project,roots):
    library=project/'.tools/art-candidate/character-surfaces/character-materials.blend'
    assert library.is_file(),'Build the original Fieldcraft material library first'
    names=tuple('Fieldcraft / '+role for role in ['cloth','leather','metal','skin'])
    with bpy.data.libraries.load(str(library),link=False) as (available,loaded):
        assert all(name in available.materials for name in names);loaded.materials=list(names)
    surfaces={name.split(' / ')[1]:material for name,material in zip(names,loaded.materials)};copies={}
    for root in roots.values():
        for obj in descendants(root):
            if obj.type!='MESH' or not obj.data.materials:continue
            role=obj.get('assetMaterial');surface='cloth' if role in {'team','canvas','pants'} else 'metal' if role in {'steel','iron'} else role
            motion=obj.get('motion',{})
            if role=='team' and root['assetKey'].split(':')[1] in {'swordsman','sentinel','king'} and motion.get('type')=='forearm' and motion.get('side',0)<0:continue
            if surface not in surfaces:continue
            color=tuple(obj.data.materials[0].diffuse_color);key=(surface,color)
            if key not in copies:
                material=surfaces[surface].copy();material.name='Figure / '+surface+' / '+str(len(copies));material.diffuse_color=color
                nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes['Export material'];base=bsdf.inputs['Base Color'].links[0].from_socket
                tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=color;links.new(base,tint.inputs[1]);links.new(tint.outputs[0],bsdf.inputs['Base Color']);copies[key]=material
            obj.data.materials[0]=copies[key]
    workshop=bpy.context.scene;workshop.name='Figure workshop';collections={}
    for key,root in roots.items():
        collection=bpy.data.collections.new('Edit / '+key);workshop.collection.children.link(collection);collections[key]=collection
        for obj in descendants(root):
            for previous in list(obj.users_collection):previous.objects.unlink(obj)
            collection.objects.link(obj)
    # Source pivots stay at the origin. Collection instances provide a gallery
    # without baking display offsets into a unit or changing any tool transform.
    gallery=bpy.data.scenes.new('Figure gallery');world=bpy.data.worlds.new('Figures / soft studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.55,.64,.72,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    for scene in [workshop,gallery]:scene.world=world
    for i,(key,collection) in enumerate(collections.items()):
        instance=bpy.data.objects.new('Study / '+key,None);instance.instance_type='COLLECTION';instance.instance_collection=collection;instance.location=((i%5-2)*4.4,i//5*5.5,0);gallery.collection.objects.link(instance)
        text=bpy.data.curves.new('Label / '+key,type='FONT');text.body=key.replace('unit:','').replace(':',' / ').title();text.size=.25;text.align_x='CENTER';label=bpy.data.objects.new('Label / '+key,text);label.location=(instance.location.x,instance.location.y-1.5,.02);gallery.collection.objects.link(label)
    floor_material=bpy.data.materials.new('Figures / neutral floor');floor_material.diffuse_color=(.12,.16,.14,1);floor_material.use_nodes=True;floor_material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.12,.16,.14,1)
    def studio(scene,target,scale):
        mesh=bpy.data.meshes.new(scene.name+' floor');mesh.from_pydata([(-60,-60,-.015),(60,-60,-.015),(60,60,-.015),(-60,60,-.015)],[],[(0,1,2,3)]);floor=bpy.data.objects.new(scene.name+' floor',mesh);mesh.materials.append(floor_material);scene.collection.objects.link(floor)
        for n,(location,power,size,color) in enumerate([((4,-6,8),700,5,(1,.86,.72)),((-5,-2,5),400,4,(.65,.79,1)),((1,5,7),650,4,(1,.95,.84))]):
            light=bpy.data.lights.new(scene.name+' light '+str(n),type='AREA');light.energy=power*scale*scale;light.shape='DISK';light.size=size*scale;light.color=color;obj=bpy.data.objects.new(light.name,light);obj.location=Vector(target)+Vector(location)*scale;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();scene.collection.objects.link(obj)
        data=bpy.data.cameras.new(scene.name+' camera');camera=bpy.data.objects.new(data.name,data);camera.location=Vector(target)+Vector((3.4,-5,3))*scale;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=3.4*scale;scene.collection.objects.link(camera);scene.camera=camera
        scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=1800 if scale>1 else 650;scene.render.resolution_y=1300 if scale>1 else 760;scene.render.resolution_percentage=100
    studio(workshop,(0,-.05,1.3),1);studio(gallery,(0,5.5,1.6),7.2)
    for layer in workshop.view_layers:
        for child in layer.layer_collection.children:
            if child.collection.name.startswith('Edit / '):child.exclude=child.collection!=collections['unit:villager:wood']
    gallery['figureRevision']='field-forms-v1';gallery['instructions']='Switch to Figure workshop to edit a figure. Toggle an Edit collection in the Outliner; source pivots and tool parents must stay unchanged.'
    if bpy.context.window:bpy.context.window.scene=gallery
