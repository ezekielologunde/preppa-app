import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Btn } from '../../src/ui';
import { uploadPostCover, uploadPostVideo } from '../../src/lib/supabase';

const MAX_SECONDS = 60;

/** In-app camera recording for video posts. Records a short clip + a cover-frame still,
 * uploads both, then hands off to post-reel.tsx to add a caption and publish. */
export default function RecordVideo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [recording, setRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const player = useVideoPlayer(videoUri, (p) => { p.loop = true; });
  useEffect(() => { if (videoUri) player.play(); }, [videoUri, player]);

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }}>
        <Icon name="camera" size={36} color="#fff" />
        <Text style={[type(15, 700), { color: '#fff', textAlign: 'center', lineHeight: 22 }]}>Preppa needs camera & microphone access to record a video post.</Text>
        <Btn label="Allow access" onPress={requestPermission} />
        <Press onPress={() => router.back()}><Text style={[type(13, 700), { color: 'rgba(255,255,255,.7)' }]}>Not now</Text></Press>
      </View>
    );
  }

  const startRecording = async () => {
    if (!cameraRef.current || recording) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo) setCoverUri(photo.uri);
    } catch { /* cover frame is best-effort; recording still proceeds */ }
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_SECONDS });
      if (video) setVideoUri(video.uri);
    } catch {
      toast('Could not record video', 'info');
    } finally {
      setRecording(false);
    }
  };
  const stopRecording = () => cameraRef.current?.stopRecording();
  const retake = () => { setVideoUri(null); setCoverUri(null); };

  const usePost = async () => {
    if (!videoUri || !coverUri || uploading) return;
    setUploading(true);
    try {
      const videoBlob = await (await fetch(videoUri)).blob();
      const coverBlob = await (await fetch(coverUri)).blob();
      const [videoUrl, coverUrl] = await Promise.all([
        uploadPostVideo(videoBlob, 'mp4'),
        uploadPostCover(coverBlob, 'jpg'),
      ]);
      router.replace({ pathname: '/hub/post-reel', params: { videoUrl, coverUrl } });
    } catch {
      toast('Could not upload your video. Please try again.', 'info');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {videoUri ? (
        <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      ) : (
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} mode="video" mute={false} />
      )}

      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Press scale={0.9} onPress={() => router.back()} label="Cancel">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={18} color="#fff" />
          </View>
        </Press>
        {!videoUri ? (
          <Press scale={0.9} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} label="Flip camera" disabled={recording}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="repeat" size={18} color="#fff" />
            </View>
          </Press>
        ) : null}
      </View>

      <View style={{ position: 'absolute', bottom: insets.bottom + 30, left: 0, right: 0, alignItems: 'center' }}>
        {uploading ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color="#fff" />
            <Text style={[type(13, 700), { color: '#fff' }]}>Uploading…</Text>
          </View>
        ) : videoUri ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Btn label="Retake" variant="ghost" onPress={retake} />
            <Btn label="Use this video" icon="check" onPress={usePost} />
          </View>
        ) : (
          <Press scale={0.92} onPress={recording ? stopRecording : startRecording} label={recording ? 'Stop recording' : 'Start recording'}>
            <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: recording ? 30 : 62, height: recording ? 30 : 62, borderRadius: recording ? 6 : 31, backgroundColor: '#E24A38' }} />
            </View>
          </Press>
        )}
        {!videoUri && !uploading ? (
          <Text style={[type(12, 700), { color: 'rgba(255,255,255,.7)', marginTop: 12 }]}>{recording ? `Recording… up to ${MAX_SECONDS}s` : 'Tap to record'}</Text>
        ) : null}
      </View>
    </View>
  );
}
