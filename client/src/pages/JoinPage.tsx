import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { joinRoom } from "../lib/rooms";

export default function JoinPage() {
  const { roomId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(`/auth?redirect=/join/${roomId}`, { replace: true });
      return;
    }
    if (!roomId) {
      navigate("/", { replace: true });
      return;
    }

    void joinRoom(roomId)
      .then(() => navigate(`/room/${roomId}`, { replace: true }))
      .catch(() => navigate("/", { replace: true }));
  }, [roomId, user, loading]);

  return <div className="loading-screen">Joining room...</div>;
}
