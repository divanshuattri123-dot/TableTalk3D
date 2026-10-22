using UnityEngine;

namespace TableTalk
{
    public static class BoardLayout
    {
        public static Vector3 Point(int position, int size)
        {
            int side = size / 4, quarter = position / side, offset = position % side;
            float edge = (side - 1) * .5f + .75f;
            float along = offset == 0 ? edge : side * .5f - offset;
            float x = quarter == 0 ? along : quarter == 1 ? -edge : quarter == 2 ? -along : edge;
            float z = quarter == 0 ? edge : quarter == 1 ? along : quarter == 2 ? -edge : -along;
            return new Vector3(x, .3f, -z);
        }

        public static Vector3 Size(int position, int size)
        {
            int side = size / 4, quarter = position / side;
            bool corner = position % side == 0;
            return new Vector3(corner || quarter % 2 == 1 ? 1.5f : 1, .16f,
                corner || quarter % 2 == 0 ? 1.5f : 1);
        }

        public static int ForwardSteps(int from, int to, int size) => (to - from + size) % size;
        public static float Span(int size) => size / 4f + 2;
        public static float ShadowRange(int size, bool angled, bool batterySaver) => batterySaver ? 18 : Span(size) * (angled ? 3.3f : 2.85f);
    }

    [System.Serializable] public class TileSnapshot
    {
        public int id, price, houses;
        public string name, boardLabel, region, detail, kind, color, ownerId;
        public bool mortgaged;
    }
    [System.Serializable] public class PlayerSnapshot
    {
        public string id, name, color, tokenId;
        public int cash, position;
        public bool inJail, bankrupt;
    }
    [System.Serializable] public class BoardSnapshot
    {
        public string roomCode, phase, activePlayerId, currencySymbol;
        public int boardSize = 40, eventId;
        public TileSnapshot[] tiles;
        public PlayerSnapshot[] players;
        public int[] dice;
    }
    [System.Serializable] public class TokenAsset
    {
        public string id, label;
        public GameObject prefab;
    }
}
