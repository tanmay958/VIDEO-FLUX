export default function BulletPoints(props) {
  let sstyle =
    "w-8 h-8 ml-16 rounded-full border-2 border-transparent bg-gray-400 text-center";
  const intial = "w-8 h-8 ml-16 rounded-full border-2 bg-gray-400 text-center ";
  const ongoing =
    "w-8 h-8 ml-16 rounded-full border-2 border-transparent bg-orange-300 text-center animate-pulseBorder";
  const done =
    "w-8 h-8 ml-16 rounded-full border-2 border-transparent bg-green-400 text-center ";

  if (props.state === "intial") {
    sstyle = intial;
  }
  if (props.state === "ongoing") {
    sstyle = ongoing;
  }
  if (props.state === "completed") {
    sstyle = done;
  }

  return (
    <div className="relative p-4 flex items-center">
      {/* Draw a connecting line if previous state was ongoing or completed */}
      {props.showLine && (
        <div className="absolute left-12 h-6 border-l-2 border-gray-300"></div>
      )}
      <div className={`${sstyle}`}>
        <div className="text-white text-xl">{props.value}</div>
      </div>
      <div className="font-Inconsolata font-extralight text-xl text-gray-500 flex p-2">
        {props.content}
      </div>
    </div>
  );
}
