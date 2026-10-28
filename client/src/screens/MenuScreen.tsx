// Home menu: the title and New Game. New Game fades the screen to black, then goes on to
// character select (which fades in once its models have drawn: useFadeOut).
import Backdrop from '../components/ui/Backdrop';
import RiftButton from '../components/ui/RiftButton';
import LoadingCover from '../components/ui/LoadingCover';
import { useFadeOut } from '../hooks/useFadeOut';

interface Props {
  onNewGame: () => void;
}

export default function MenuScreen({ onNewGame }: Props) {
  const { fading, fadeOut } = useFadeOut();

  return (
    <Backdrop variant="title" className="flex flex-col items-center justify-center px-4 py-12">
      <main className="relative flex flex-col items-center gap-[72px]" style={{ marginTop: '-4vh' }}>
        <h1
          className="m-0 font-display font-normal leading-none text-center text-rift-ink"
          style={{
            fontSize: 'clamp(52px, 11.5vw, 160px)',
            letterSpacing: '0.12em',
            paddingLeft: '0.12em', // balances the trailing letter-spacing so the word sits centred
            textShadow: '0 -1px 0 rgba(255, 255, 255, 0.07), 0 3px 2px rgba(0, 0, 0, 0.85), 0 0 48px color-mix(in srgb, var(--glow) 16%, transparent)',
          }}
        >
          Rifter
        </h1>

        <div className="flex flex-col items-center gap-14">
          <div aria-hidden="true" className="w-16 h-px" style={{ background: 'color-mix(in srgb, var(--glow) 35%, transparent)' }} />
          <RiftButton size="lg" onClick={() => fadeOut(onNewGame)}>New Game</RiftButton>
        </div>
      </main>
      <LoadingCover loading={fading} fadeIn className="fixed inset-0 z-50" />
    </Backdrop>
  );
}
