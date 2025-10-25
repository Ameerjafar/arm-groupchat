export default function HomePage() {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700">
        <div className="text-center text-white">
          <h1 className="text-5xl font-bold mb-4">Group Fund Manager</h1>
          <p className="text-xl mb-8">Manage your Solana group funds</p>
          <a
            href="/contribute?groupId=-1001234567890&userId=123456"
            className="px-8 py-4 bg-white text-purple-600 font-semibold rounded-lg shadow-lg hover:bg-gray-100 transition"
          >
            Go to Contribute
          </a>
        </div>
      </div>
    );
  }
  