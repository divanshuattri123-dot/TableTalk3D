using System.Collections.Generic;
using UnityEngine;

namespace TableTalk
{
    public partial class TableTalkPresentation
    {
        Transform alternateWorld;
        string activeWorld="theme000";
        readonly List<Material> worldMaterials=new List<Material>();

        void SetBoardWorld(string id,int boardSize)
        {
            id=string.IsNullOrEmpty(id)?"theme000":id;
            if(activeWorld!=id)
            {
                if(alternateWorld!=null)Destroy(alternateWorld.gameObject);
                foreach(var material in worldMaterials)Destroy(material);
                worldMaterials.Clear();alternateWorld=null;
                var source=id=="theme000"?null:Resources.Load<GameObject>("BoardWorlds/"+id);
                if(source!=null)
                {
                    alternateWorld=Instantiate(source).transform;
                    alternateWorld.name="Active map — "+id;
                    alternateWorld.position=new Vector3(0,.23f,0);
                    var copies=new Dictionary<Material,Material>();
                    foreach(var renderer in alternateWorld.GetComponentsInChildren<Renderer>())
                    {
                        var original=renderer.sharedMaterial;
                        if(!copies.TryGetValue(original,out var copy))
                        {copy=new Material(original);copies[original]=copy;worldMaterials.Add(copy);}
                        renderer.sharedMaterial=copy;
                    }
                }
                activeWorld=source!=null?id:"theme000";
                // World prefabs load on demand; switching releases the previous geometry.
                Resources.UnloadUnusedAssets();
            }
            if(city!=null)city.gameObject.SetActive(activeWorld=="theme000");
            if(alternateWorld!=null)alternateWorld.localScale=Vector3.one*(boardSize/4f-1.45f);
        }

        void LightBoardWorld(bool night,bool battery)
        {
            foreach(var material in worldMaterials)
            {material.SetFloat("_NightLighting",night?1:0);material.SetFloat("_FacadeDetail",battery ? .3f : .65f);}
        }

        void DisposeBoardWorld()
        {
            if(alternateWorld!=null)Destroy(alternateWorld.gameObject);
            foreach(var material in worldMaterials)Destroy(material);
            worldMaterials.Clear();
        }
    }
}
