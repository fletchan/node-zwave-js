import { IDriver } from "../driver/IDriver";
import { ZWaveError, ZWaveErrorCodes } from "../error/ZWaveError";
import { JSONObject } from "../util/misc";
import { Duration } from "../values/Duration";
import { Maybe, parseMaybeNumber, parseNumber } from "../values/Primitive";
import { CCAPI } from "./API";
import {
	API,
	CCCommand,
	CCCommandOptions,
	ccValue,
	CommandClass,
	commandClass,
	CommandClassDeserializationOptions,
	expectedCCResponse,
	gotDeserializationOptions,
	implementedVersion,
} from "./CommandClass";
import { CommandClasses } from "./CommandClasses";

export class BasicCCAPI extends CCAPI {
	public async get() {
		const cc = new BasicCCGet(this.driver, { nodeId: this.node.id });
		const response = await this.driver.sendCommand(cc);
		if (response instanceof BasicCCReport) {
			// TODO: Maybe rethink this (include target value etc.)
			return response.currentValue;
		}
		throw new ZWaveError(
			`Invalid response received to BasicCC.Get`,
			ZWaveErrorCodes.CC_Invalid,
		);
	}
}

export enum BasicCommand {
	Set = 0x01,
	Get = 0x02,
	Report = 0x03,
}

@commandClass(CommandClasses.Basic)
@implementedVersion(2) // Update tests in CommandClass.test.ts when changing this
@API(BasicCCAPI)
export class BasicCC extends CommandClass {
	public ccCommand!: BasicCommand;
}

interface BasicCCSetOptions extends CCCommandOptions {
	targetValue: number;
}

@CCCommand(BasicCommand.Set)
export class BasicCCSet extends BasicCC {
	public constructor(
		driver: IDriver,
		options: CommandClassDeserializationOptions | BasicCCSetOptions,
	) {
		super(driver, options);
		if (gotDeserializationOptions(options)) {
			this.targetValue = this.payload[0];
		} else {
			this.targetValue = options.targetValue;
		}
	}

	public targetValue: number;

	public serialize(): Buffer {
		this.payload = Buffer.from([this.targetValue]);
		return super.serialize();
	}
}

@CCCommand(BasicCommand.Report)
export class BasicCCReport extends BasicCC {
	public constructor(
		driver: IDriver,
		options: CommandClassDeserializationOptions,
	) {
		super(driver, options);
		this._currentValue = parseMaybeNumber(this.payload[0]);
		if (this.version >= 2) {
			this._targetValue = parseNumber(this.payload[1]);
			this._duration = Duration.parseReport(this.payload[2]);
		}
		this.persistValues();
	}

	private _currentValue: Maybe<number> | undefined;
	@ccValue() public get currentValue(): Maybe<number> | undefined {
		return this._currentValue;
	}

	private _targetValue: number | undefined;
	@ccValue() public get targetValue(): number | undefined {
		return this._targetValue;
	}

	private _duration: Duration | undefined;
	@ccValue() public get duration(): Duration | undefined {
		return this._duration;
	}

	public toJSON(): JSONObject {
		return super.toJSONInherited({
			currentValue: this.currentValue,
			targetValue: this.targetValue,
			duration: this.duration,
		});
	}
}

@CCCommand(BasicCommand.Get)
@expectedCCResponse(BasicCCReport)
export class BasicCCGet extends BasicCC {
	public constructor(
		driver: IDriver,
		options: CommandClassDeserializationOptions | CCCommandOptions,
	) {
		super(driver, options);
	}
}
