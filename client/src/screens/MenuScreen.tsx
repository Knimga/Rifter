interface Props {
  onNewGame: () => void;
}

export default function MenuScreen({ onNewGame }: Props) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-red-500 mb-4 tracking-wider">
          RIFTER
        </h1>
        <h2 className="text-2xl font-bold text-gray-300 mb-12">
          DUNGEON CRAWLER
        </h2>
        <button
          onClick={onNewGame}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-12 text-2xl rounded transition-colors"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
